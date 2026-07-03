const BaseCommand = require("../../../../utils/structures/BaseCommand");
const { EmbedBuilder, userMention } = require('discord.js');

// Cooldown map to store user cooldowns
const cooldowns = new Map();

module.exports = class Gaydar extends BaseCommand {
    constructor() {
        super('thiccdar', 'fun', ['thiccd', 'tcdar']);
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
        if (percent >= 81 && percent <= 100) {
            image = 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_19_11_bK60rTWi.gif';
            description = `${userMention(targetUser.id)} your thiccness is ${percent}% and you are a certified thicc.`;
        } else if (percent >= 51 && percent <= 80) {
            image = 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_22_59_TVOGkchQ.gif';
            description = `${userMention(targetUser.id)} your thiccness is ${percent}% and you are a mostly thicc.`;
        } else {
            image = 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_30_48_zZMJWleA.gif';
            description = `${userMention(targetUser.id)} your thiccness is ${percent}% and you are thicc but not certified.`;
        }

        // Create the embed
        let embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('Thiccness Detected')
            .setDescription(description)
            .setImage(image)
            .setTimestamp();

        // Send the embed mentioning the target user
        await message.channel.send({ embeds: [embed] });

        // Set the cooldown for the user
        cooldowns.set(user.id, Date.now());
    }
}
