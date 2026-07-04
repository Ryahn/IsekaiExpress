const { Client, GatewayIntentBits, Collection, Events, Partials } = require('discord.js');
const { registerCommands, registerEvents, populateBuiltinChatCommandKeys } = require('./utils/register');
const schedule = require('node-schedule');
const config = require('../../config');
const { farmManager } = require('./utils/farm/farmManager');
const db = require('../../database/db');
const { syncPhishGgServers } = require('../../libs/phishGgSync');
const { timestamp } = require('../../libs/utils');
const logger = require('../../libs/logger');
const process = require('process');
const cooldownManager = require('./utils/cooldownManager');
const rateLimitHandler = require('./utils/rateLimitHandler');
const { createNonOverlappingJob } = require('./utils/nonOverlappingJob');
const { recordModerationAction } = require('../../libs/moderationActionLog');

// Connection management constants
const MAX_RECONNECT_ATTEMPTS = 5;
// 1 second
const INITIAL_RECONNECT_DELAY = 1000;
// 1 minute
const MAX_RECONNECT_DELAY = 60000;

class BotClient extends Client {
	constructor(options) {
		super(options);
		this.reconnectAttempts = 0;
		this.reconnectTimeout = null;
	}

	async connect() {
		// Fail fast (clear missing-variable NAMES, never values) instead of looping on a bad login.
		const missing = [];
		if (!config.discord.botToken) missing.push('DISCORD_BOT_TOKEN');
		if (!config.discord.applicationId) missing.push('APPLICATION_ID (or DISCORD_CLIENT_ID)');
		if (!config.discord.guildId) missing.push('DISCORD_GUILD_ID');
		if (!config.mysql.user) missing.push('MYSQL_USER');
		if (!config.mysql.database) missing.push('MYSQL_DB');
		if (missing.length) {
			logger.error(`Missing required environment variables: ${missing.join(', ')}. Set them in .env (see .env.example).`);
			process.exit(1);
		}
		try {
			logger.startup('Bot is starting...');
			await this.login(config.discord.botToken);
			// Reset attempts on successful connection
			this.reconnectAttempts = 0;
			logger.startup('Bot has started!');
		}
		catch (error) {
			logger.error('Failed to connect:', error);
			this.handleReconnect();
		}
	}

	handleReconnect() {
		if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			logger.error(`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Shutting down.`);
			process.exit(1);
			return;
		}

		// Calculate delay with exponential backoff
		const delay = Math.min(
			INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
			MAX_RECONNECT_DELAY,
		);

		logger.info(`Attempting to reconnect in ${delay / 1000} seconds... (Attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

		clearTimeout(this.reconnectTimeout);
		this.reconnectTimeout = setTimeout(() => {
			this.reconnectAttempts++;
			this.connect();
		}, delay);
	}
}

const client = new BotClient({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildBans,
		GatewayIntentBits.GuildModeration,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.GuildMessageReactions,
	],
	partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

let shuttingDown = false;

(async () => {
	client.commands = new Collection();
	client.slashCommands = new Collection();
	await registerCommands(client, '../commands/chatCommands');
	populateBuiltinChatCommandKeys(client);
	await registerEvents(client, '../events');
	client.db = require('../../database/db');
	client.logger = logger;
	client.config = config;
	client.utils = require('../../libs/utils');
	client.cooldownManager = cooldownManager;
	client.rateLimitHandler = rateLimitHandler;
	client.cache = {
		allowedChannels: new Map(),
		allowedRoles: new Map(),
		allowedUsers: new Map(),
	};
	const trimRoleId = (id) => (typeof id === 'string' ? id.trim() : '');
	client.allowed = [
		config.discord.ownerId,
		config.roles.mod,
		config.roles.uploader,
		config.roles.staff,
		config.roles.user,
		config.roles.trialmod,
	]
		.map(trimRoleId)
		.filter(Boolean);
	client.guildGlobalLock = new Map();
	client.customCommandsByHash = new Map();
	client.customCommandsRevision = 0;

	client.on('shardDisconnect', (_event, shardId) => {
		logger.warn(`Bot shard ${shardId} disconnected from Discord`);
	});

	// Log client errors; avoid reconnecting on every generic `error` (can misfire and double-login / loop).
	client.on(Events.Error, (error) => {
		const message =
            error instanceof Error
            	? error.stack || error.message
            	: typeof error === 'string'
            		? error
            		: (() => {
            			try {
            				return JSON.stringify(error, Object.getOwnPropertyNames(error));
            			}
            			catch {
            				return String(error);
            			}
            		})();
		logger.error('Discord client error: ' + message);
	});

	// Handle debug messages
	client.on('debug', (info) => {
		if (info.includes('Session invalidated') || info.includes('Connection reset by peer')) {
			logger.warn('Session invalidated or connection reset');
		}
	});

	client.once(Events.ClientReady, () => {

		const runCagedCleanup = createNonOverlappingJob('caged cleanup', logger, async () => {
			try {
				const expiredUsers = await db.getExpiredCagedUsers(timestamp());

				if (!expiredUsers) {
					return;
				}

				const guild = client.guilds.cache.get(config.discord.guildId);
				if (!guild) {
					logger.error('[SCHEDULE] Guild not found - Caged Schedule');
					return;
				}

				if (!expiredUsers) {
					return;
				}

				for (const user of expiredUsers) {
					try {
						const member = await guild.members.fetch(user.discord_id);
						if (member) {
							await member.roles.remove(user.role_id);
							await db.removeCage(user.discord_id);
							await recordModerationAction(client, {
								guild,
								actionType: 'uncaged_expired',
								targetUserId: user.discord_id,
								targetMember: member,
								moderatorUserId: client.user?.id,
								reason: 'Cage expired (scheduled cleanup)',
								source: 'scheduled',
								metadata: {
									roleId: user.role_id,
								},
							});
							logger.info(`[SCHEDULE] Removed cage from user ${user.discord_id}`);
						}
					}
					catch (error) {
						logger.error(`[SCHEDULE] Error processing schedule job for user ${user.discord_id}:`, error);
					}
				}
			}
			catch (error) {
				logger.error('[SCHEDULE] Error in scheduled job:', error);
			}
		});
		schedule.scheduleJob('*/1 * * * *', runCagedCleanup);

		const runFarmMaturityPings = createNonOverlappingJob('farm maturity reminders', logger, async () => {
			try {
				await farmManager.runHarvestMaturityPings(client);
			}
			catch (error) {
				logger.error('[FARM-REMIND] Error in harvest maturity job:', error);
			}
		});
		schedule.scheduleJob('*/3 * * * *', runFarmMaturityPings);

		if (config.phishGg && config.phishGg.dailySyncEnabled) {
			const runPhishSync = createNonOverlappingJob('phish sync', logger, async () => {
				try {
					const r = await syncPhishGgServers(db.query, { addedBy: null, dryRun: false });
					logger.info(
						`[PHISH-SYNC] api rows=${r.apiCount} guild upserts=${r.guildRows} invite upserts=${r.inviteRows}`,
					);
				}
				catch (err) {
					logger.error('[PHISH-SYNC] failed', err);
				}
			});
			const ms = config.phishGg.dailySyncIntervalMs;
			if (ms >= 60_000) {
				client.phishSyncInterval = setInterval(runPhishSync, ms);
				client.phishSyncStartupTimeout = setTimeout(runPhishSync, 90_000);
			} else {
				logger.warn('[PHISH-SYNC] PHISH_GG_DAILY_SYNC_MS is below 1 minute; ignored.');
			}
		}

	});

	async function shutdown(signal) {
		if (shuttingDown) {
			logger.warn(`Received ${signal} while shutdown is already in progress.`);
			return;
		}
		shuttingDown = true;
		logger.info(`Received ${signal}. Shutting down gracefully...`);

		try {
			await schedule.gracefulShutdown();
		} catch (err) {
			logger.error('Error stopping scheduled jobs:', err);
		}

		clearTimeout(client.reconnectTimeout);
		if (client.customCommandsPollInterval) clearInterval(client.customCommandsPollInterval);
		if (client.customCommandsSafetyInterval) clearInterval(client.customCommandsSafetyInterval);
		if (client.pendingInvitesCleanupInterval) clearInterval(client.pendingInvitesCleanupInterval);
		if (client.phishSyncInterval) clearInterval(client.phishSyncInterval);
		if (client.phishSyncStartupTimeout) clearTimeout(client.phishSyncStartupTimeout);

		try {
			client.destroy();
		} catch (err) {
			logger.error('Error destroying Discord client:', err);
		}

		try {
			await db.end();
		} catch (err) {
			logger.error('Error closing Knex pool:', err);
		}

		if (typeof logger.shutdownWebhook === 'function') {
			logger.shutdownWebhook();
		}

		process.exit(0);
	}

	// Graceful shutdown handlers
	process.on('SIGINT', () => {
		shutdown('SIGINT');
	});

	process.on('SIGTERM', () => {
		shutdown('SIGTERM');
	});

	// Start the connection
	await client.connect();
})();