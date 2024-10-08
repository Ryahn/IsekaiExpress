const {Client, Intents, Collection} = require('discord.js');
const {registerCommands, registerEvents} = require('./utils/register');
const schedule = require('node-schedule');
const config = require('../../.config');
const db = require('../../database/db');
const { timestamp } = require('../../libs/utils');
const logger = require('silly-logger');
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS,
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
    client.db = db;
    client.logger = logger;
    client.config = config;
    client.utils = require('../../libs/utils');

schedule.scheduleJob('*/1 * * * *', async () => {
    
    try {
        
        const expiredUsers = await db.getExpiredCagedUsers(timestamp());

        const guild = client.guilds.cache.get(config.discord.guildId);
        if (!guild) {
            logger.error('Guild not found');
            return;
        }

        for (const user of expiredUsers) {
            try {
                const member = await guild.members.fetch(user.discord_id);
                if (member) {
                    const oldRoles = JSON.parse(user.old_roles);
                    await member.roles.set(oldRoles);
                    await db.removeCage(user.discord_id);
                    logger.info(`Removed cage from user ${user.discord_id}`);
                }
            } catch (error) {
                logger.error(`Error processing user ${user.discord_id}:`, error);
            }
        }
    } catch (error) {
        logger.error('Error in scheduled job:', error);
    }
});

})();