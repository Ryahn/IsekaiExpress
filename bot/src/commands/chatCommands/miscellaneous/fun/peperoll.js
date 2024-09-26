const BaseCommand = require("../../../../utils/structures/BaseCommand");
const { MessageEmbed, Formatters } = require('discord.js'); // Import Formatters

// Cooldown map to store user cooldowns
const cooldowns = new Map();

module.exports = class Gaydar extends BaseCommand {
    constructor() {
        super('peperoll', 'fun', ['proll']);
    }

    async run(client, message) {
        const cooldownTime = 10 * 1000; // Cooldown time in milliseconds (e.g., 10 seconds)
		const user = message.author

        // Check if the user is on cooldown
        if (cooldowns.has(user.id)) {
            const expirationTime = cooldowns.get(user.id) + cooldownTime;

            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return message.reply(`You are on cooldown! Please wait ${timeLeft.toFixed(1)} more seconds.`);
            }
        }

        const randomNum = Math.floor(Math.random() * (parseInt(1000000000) - parseInt(1) + 1)) + parseInt(1)
        message.channel.send(`<@${message.author.id}>, you rolled a **${randomNum}**!`);

        // Set the cooldown for the user
        cooldowns.set(user.id, Date.now());
    }
}
