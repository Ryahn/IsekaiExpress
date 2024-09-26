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

		let messageContent;

		if (message.mentions.members.first()) {
			messageContent = `<@${targetUser.id}>
			Hello Caged user. You're detained under Paragraph 6 of Schedule 7 to the Terrorism Act 2000. You will not be detained for over 96 hours. You have the right and duty to remain silent.

As always your safety is our priority,
-The Staff Team`;
		} else {
			messageContent = `You must mention a user!`;
		}

        // Send the embed mentioning the target user
        await message.channel.send(messageContent);

        // Set the cooldown for the user
        cooldowns.set(user.id, Date.now());
    }
}
