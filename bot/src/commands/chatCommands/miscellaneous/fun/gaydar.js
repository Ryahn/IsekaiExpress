const BaseCommand = require("../../../../utils/structures/BaseCommand");
const { MessageEmbed, Formatters } = require('discord.js'); // Import Formatters

// Cooldown map to store user cooldowns
const cooldowns = new Map();

module.exports = class Gaydar extends BaseCommand {
    constructor() {
        super('gaydar', 'fun', ['gay', 'gdar']);
    }

    async run(client, message) {
        const cooldownTime = 2 * 1000; // Cooldown time in milliseconds (e.g., 10 seconds)
        const user = message.author;

        // Get mentioned member or the author if none is mentioned
        const member = message.mentions.members.first() || message.member;
        const targetUser = member.user;

        // Check if the user is on cooldown
        if (cooldowns.has(user.id)) {
            const expirationTime = cooldowns.get(user.id) + cooldownTime;

            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return message.reply(`You are on cooldown! Please wait ${timeLeft.toFixed(1)} more seconds.`);
            }
        }

        // Calculate random gayness percentage
        let percent = Math.floor(Math.random() * 100) + 1;
        let image = '';
        let description = '';
        if (percent >= 80) {
            image = 'https://overlord.lordainz.xyz/f/astolfo.gif';
            description = `${Formatters.userMention(targetUser.id)} your gayness is ${percent}% and you are a certified trap.`;
        } else {
            image = 'https://overlord.lordainz.xyz/f/gaydar.jpg';
            description = `${Formatters.userMention(targetUser.id)} has been scanned by the gaydar and is ${percent}% gay.`;
        }

        // Create the embed
        let embed = new MessageEmbed()
            .setColor('BLUE')
            .setTitle('Gayness Detected')
            .setDescription(description)
            .setImage(image)
            .setTimestamp();

        // Send the embed mentioning the target user
        await message.channel.send({ embeds: [embed] });

        // Set the cooldown for the user
        cooldowns.set(user.id, Date.now());
    }
}
