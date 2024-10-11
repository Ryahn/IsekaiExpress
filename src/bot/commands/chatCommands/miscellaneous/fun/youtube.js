const BaseCommand = require("../../../../utils/structures/BaseCommand");
const { MessageEmbed, Formatters } = require('discord.js'); // Import Formatters

// Cooldown map to store user cooldowns
const cooldowns = new Map();

module.exports = class Gaydar extends BaseCommand {
    constructor() {
        super('youtube', 'fun', ['yt']);
    }

    async run(client, message) {
        
        await message.channel.send('Use the /youtube slash command instead.');

    }
}
