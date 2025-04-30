const {Client, Intents, Collection} = require('discord.js');
const {registerCommands, registerEvents} = require('./utils/register');
const schedule = require('node-schedule');
const config = require('../../.config');
const db = require('../../database/db');
const { timestamp } = require('../../libs/utils');
const logger = require('silly-logger');
const process = require('process');
const cooldownManager = require('./utils/cooldownManager');
const rateLimitHandler = require('./utils/rateLimitHandler');

// Connection management constants
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 60000; // 1 minute

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
            this.reconnectAttempts = 0; // Reset attempts on successful connection
            logger.startup('Bot has started!');
        } catch (error) {
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
            MAX_RECONNECT_DELAY
        );

        logger.info(`Attempting to reconnect in ${delay/1000} seconds... (Attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }
}

const client = new BotClient({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_BANS,
        Intents.FLAGS.GUILD_PRESENCES,
    ]
});

(async () => {
    client.commands = new Collection();
    client.slashCommands = new Collection();
    await registerCommands(client, '../commands/chatCommands');
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
    }
    client.allowed = [
        config.discord.ownerId,
        config.roles.mod,
        config.roles.staff
    ];

    // Handle disconnections
    client.on('disconnect', () => {
        logger.warn('Bot disconnected from Discord');
        client.handleReconnect();
    });

    // Handle errors
    client.on('error', (error) => {
        logger.error('Discord client error:', error);
        client.handleReconnect();
    });

    // Handle debug messages
    client.on('debug', (info) => {
        if (info.includes('Session invalidated') || info.includes('Connection reset by peer')) {
            logger.warn('Session invalidated or connection reset');
            client.handleReconnect();
        }
    });

    client.on('ready', () => {

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
                    } catch (error) {
                        logger.error(`[SCHEDULE] Error processing schedule job for user ${user.discord_id}:`, error);
                    }
                }
            } catch (error) {
                logger.error('[SCHEDULE] Error in scheduled job:', error);
            }
        });

    });

    client.on('rateLimit', (rateLimitInfo) => {
        client.logger.warn(`Rate limit hit! Timeout: ${rateLimitInfo.timeout}ms, Limit: ${rateLimitInfo.limit}, Method: ${rateLimitInfo.method}, Path: ${rateLimitInfo.path}, Route: ${rateLimitInfo.route}`);
        
    });

    // Graceful shutdown handlers
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT. Shutting down gracefully...');
        clearTimeout(client.reconnectTimeout);
        await db.end();
        client.destroy();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM. Shutting down gracefully...');
        clearTimeout(client.reconnectTimeout);
        await db.end();
        client.destroy();
        process.exit(0);
    });

    // Start the connection
    await client.connect();
})();