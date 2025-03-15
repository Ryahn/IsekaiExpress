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

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS,
    Intents.FLAGS.GUILD_PRESENCES,
  ]
});

(async () => {

    logger.startup('Bot is starting...');
    client.login(config.discord.botToken);
    client.prefix = config.discord.prefix;
    logger.startup('Bot has started!');
    logger.info(`Prefix: ${client.prefix}`);

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

    process.on('SIGINT', async () => {
        logger.info('Received SIGINT. Shutting down gracefully...');
        await db.end();
        client.destroy();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM. Shutting down gracefully...');
        await db.end();
        client.destroy();
        process.exit(0);
    });

})();