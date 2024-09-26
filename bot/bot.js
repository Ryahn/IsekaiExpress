require('dotenv').config();
const {Client, Intents, Collection} = require('discord.js');
const {registerCommands, registerEvents} = require('./utils/register');
const schedule = require('node-schedule');
const moment = require('moment');
const StateManager = require('./utils/StateManager');
const path = require('path');

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS
  ]
});

(async () => {

    console.log('Bot is starting...');
    client.login(process.env.DISCORD_BOT_TOKEN);
    client.prefix = process.env.PREFIX;
    console.log('Bot has started!');
    console.log(`Prefix: ${client.prefix}`);


    client.commands = new Collection();
    client.slashCommands = new Collection();
    await registerCommands(client, '../commands/chatCommands');
    await registerEvents(client, '../events');
    const stateManager = new StateManager();

// Schedule the task to check every minute
schedule.scheduleJob('*/1 * * * *', async () => {
    const currentTime = moment().unix(); // Get current Unix timestamp
    const filename = `${path.basename(__filename)} - ${process.env.PREFIX}${process.env.COMMAND_NAME}`;
    
    try {
        await stateManager.initPool(); // Ensure the pool is initialized
        
        const expiredUsers = await stateManager.query(
            `SELECT discord_id, old_roles FROM caged_users WHERE expires > 0 AND expires <= ?`, [currentTime]
        );

        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
        if (!guild) {
            console.error('Guild not found');
            return;
        }

        for (const user of expiredUsers) {
            try {
                const member = await guild.members.fetch(user.discord_id);
                if (member) {
                    const oldRoles = JSON.parse(user.old_roles);
                    await member.roles.set(oldRoles);
                    await stateManager.query('DELETE FROM caged_users WHERE discord_id = ?', [user.discord_id]);
                    console.log(`Removed cage from user ${user.discord_id}`);
                }
            } catch (error) {
                console.error(`Error processing user ${user.discord_id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in scheduled job:', error);
    } finally {
        await stateManager.closePool(filename);
    }
});

})();