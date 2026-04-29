const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const { registerCommands, registerEvents, populateBuiltinChatCommandKeys } = require('./utils/register');
const schedule = require('node-schedule');
const config = require('../../config');
const { farmManager } = require('./utils/farm/farmManager');
const db = require('../../database/db');
const { syncPhishGgServers } = require('../../libs/phishGgSync');
const tcgFeaturedShop = require('../../libs/tcgFeaturedShop');
const { timestamp } = require('../../libs/utils');
const logger = require('../../libs/logger');
const process = require('process');
const cooldownManager = require('./utils/cooldownManager');
const rateLimitHandler = require('./utils/rateLimitHandler');

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
		GatewayIntentBits.GuildPresences,
	],
});

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
	client.allowed = [
		config.discord.ownerId,
		config.roles.mod,
		config.roles.uploader,
		config.roles.staff,
		config.roles.user,
	];
	client.guildGlobalLock = new Map();
	client.customCommandsByHash = new Map();
	client.customCommandsRevision = 0;

	client.on('shardDisconnect', (_event, shardId) => {
		logger.warn(`Bot shard ${shardId} disconnected from Discord`);
		client.handleReconnect();
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
			client.handleReconnect();
		}
	});

	client.once(Events.ClientReady, () => {

		schedule.scheduleJob('*/1 * * * *', async () => {
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

		schedule.scheduleJob('*/3 * * * *', async () => {
			try {
				await farmManager.runHarvestMaturityPings(client);
			}
			catch (error) {
				logger.error('[FARM-REMIND] Error in harvest maturity job:', error);
			}
		});

		schedule.scheduleJob('5 0 * * *', async () => {
			try {
				const ch = config.tcg?.featuredAnnounceChannelId;
				if (!ch) return;
				const meta = config.tcg?.metaSeasonKey || 's0';
				const r = await tcgFeaturedShop.postFeaturedAnnouncementIfConfigured(client, ch, meta);
				if (r.ok && !r.skipped) {
					logger.info(`[TCG-FEATURED] posted daily offer msg=${r.messageId}`);
				} else if (!r.ok && r.error) {
					logger.warn(`[TCG-FEATURED] announce failed: ${r.error}`);
				}
			}
			catch (err) {
				logger.error('[TCG-FEATURED] announce job error', err);
			}
		});

		if (config.phishGg && config.phishGg.dailySyncEnabled) {
			const runPhishSync = async () => {
				try {
					const r = await syncPhishGgServers(db.query, { addedBy: null, dryRun: false });
					logger.info(
						`[PHISH-SYNC] api rows=${r.apiCount} guild upserts=${r.guildRows} invite upserts=${r.inviteRows}`,
					);
				}
				catch (err) {
					logger.error('[PHISH-SYNC] failed', err);
				}
			};
			const ms = config.phishGg.dailySyncIntervalMs;
			if (ms >= 60_000) {
				setInterval(runPhishSync, ms);
				setTimeout(runPhishSync, 90_000);
			} else {
				logger.warn('[PHISH-SYNC] PHISH_GG_DAILY_SYNC_MS is below 1 minute; ignored.');
			}
		}

	});

	// Graceful shutdown handlers
	process.on('SIGINT', async () => {
		logger.info('Received SIGINT. Shutting down gracefully...');
		clearTimeout(client.reconnectTimeout);
		if (client.customCommandsPollInterval) clearInterval(client.customCommandsPollInterval);
		if (client.customCommandsSafetyInterval) clearInterval(client.customCommandsSafetyInterval);
		await db.end();
		client.destroy();
		process.exit(0);
	});

	process.on('SIGTERM', async () => {
		logger.info('Received SIGTERM. Shutting down gracefully...');
		clearTimeout(client.reconnectTimeout);
		if (client.customCommandsPollInterval) clearInterval(client.customCommandsPollInterval);
		if (client.customCommandsSafetyInterval) clearInterval(client.customCommandsSafetyInterval);
		await db.end();
		client.destroy();
		process.exit(0);
	});

	// Start the connection
	await client.connect();
})();