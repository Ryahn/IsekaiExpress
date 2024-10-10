const { MessageEmbed } = require('discord.js');

const self = module.exports = {
	xpSystem: async (client, message) => {
		try {
			client.db.checkUser(message.author);
			const user = await client.db.getUserXP(message.author.id);
			const settings = await client.db.getXPSettings();
			const guildSettings = await client.db.getGuildConfigurable(message.guild.id);
			user.message_count++;
		
			if (user.message_count >= settings.messages_per_xp) {
				user.message_count = 0;
				let xpGain = Math.floor(Math.random() * (settings.max_xp_per_gain - settings.min_xp_per_gain + 1)) + settings.min_xp_per_gain;
		
				if (settings.double_xp_enabled || self.isWeekend(settings.weekend_days)) {
					xpGain *= settings.weekend_multiplier;
				}
		
				user.xp += xpGain;
		
				const newLevel = self.calculateLevel(user.xp);
				if (newLevel > user.level) {
					user.level = newLevel;
					if (guildSettings.level_up_enabled) {
						const channel = message.guild.channels.cache.get(guildSettings.level_up_channel);
						self.sendLevelUpMessage(channel, message.author, newLevel);
					}
				}
		
				await client.db.updateUserXPAndLevel(message.author.id, user.xp, user.level, user.message_count);
				client.logger.info(`${message.author.username} gained ${xpGain} XP and is now level ${user.level}`);
			} else {
				await client.db.updateUserMessageCount(message.author.id, user.message_count);
			}
		} catch (error) {
			client.logger.error('Error in XP system:', error);
		}
	},

	isWeekend: (weekendDays) => {
		const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
		return weekendDays.split(',').includes(today);
	},

	calculateLevel: (xp) => Math.floor(0.47 * Math.sqrt(xp)),

	sendLevelUpMessage: (channel, user, newLevel) => {
        const embed = new MessageEmbed()
            .setTitle('Level Up!')
            .setDescription(`Congratulations ${user.username}! You've reached level ${newLevel}!`)
            .setColor('#00FF00')
            .setThumbnail(user.displayAvatarURL());
        
        channel.send({ embeds: [embed] });
    }
};
