const { MessageEmbed } = require('discord.js');

const self = module.exports = {
	afkSystem: async (client, message) => {
		try {
			const afkUser = await client.db.getAfkUser(message.author.id, message.guild.id);

			if (afkUser.length > 0) {
				await client.db.deleteAfkUser(message.author.id, message.guild.id);
				const embed = new MessageEmbed()
					.setColor('#00FF00')
					.setDescription(`Welcome back, ${message.author}! Your AFK status has been removed.`);
				await message.reply({ embeds: [embed] });
			}

			const mentionedUsers = message.mentions.users;
			if (mentionedUsers.size > 0) {
				for (const [userId, user] of mentionedUsers) {
					const [afkMentioned] = await client.db.getAfkUser(userId, message.guild.id);
					if (afkMentioned) {
						const embed = new MessageEmbed()
							.setColor('#FFA500')
							.setDescription(`${user} is currently AFK: ${afkMentioned.message}`);
						await message.reply({ embeds: [embed] });
					}
				}
			}
		} catch (error) {
			client.logger.error('Error in AFK system:', error);
			return message.reply({ content: 'There was an error in the AFK system. Please try again later.' });
		}
	}
}