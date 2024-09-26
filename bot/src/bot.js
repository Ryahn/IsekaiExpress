require('dotenv').config({path: '../../.env'});
const {Client, Intents, Collection} = require('discord.js');
const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_BANS]});
const {registerCommands, registerEvents} = require('./utils/register');
const {Routes} = require("discord-api-types/v9");
const {REST} = require("@discordjs/rest");
const schedule = require('node-schedule'); // Use this for more reliable scheduling
const moment = require('moment'); // For easier timestamp handling
const { getConnection } = require('../database/db');
const StateManager = require('./utils/StateManager');

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

// Schedule the task to check every minute
schedule.scheduleJob('*/1 * * * *', async () => {
    const currentTime = moment().unix(); // Get current Unix timestamp
    const connection = await getConnection();
    const stateManager = new StateManager(connection);
    const expiredUsers = await stateManager.query(
        `SELECT discord_id, old_roles FROM caged_users WHERE expires > 0 AND expires <= ?`, [currentTime]
    );

    for (let user of expiredUsers) {
        const member = await client.guilds.cache.get(process.env.DISCORD_GUILD_ID).members.fetch(user.discord_id);
        if (!member) continue; // Skip if the member is no longer in the guild
        
        // Restore old roles
        const oldRoles = JSON.parse(user.old_roles);
        await member.roles.set(oldRoles).catch(console.error);

        // Remove the user from the caged_users table
        await stateManager.query(`DELETE FROM caged_users WHERE discord_id = ?`, [user.discord_id]);

        console.log(`Removed cage from user ${user.discord_id}`);
    }
});

})();