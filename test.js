const { Routes } = require("discord-api-types/v10");
const { REST } = require("@discordjs/rest");
require("dotenv").config();

const token = process.env.DISCORD_BOT_TOKEN; // Replace with your bot token
const channelId = '443830570703912970'; // Replace with the channel ID

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    // Fetch the channel details
    const channel = await rest.get(Routes.channel(channelId));
    
    // Get the channel name
    console.log(`Channel Name: ${channel.name}`);
  } catch (error) {
    console.error('Error fetching the channel:', error);
  }
})();
