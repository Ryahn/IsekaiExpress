const { EmbedBuilder } = require('discord.js');
const { farmManager } = require('../../../utils/farm/farmManager');

async function handleFarmLogin(message) {
	const userId = message.author.id;
	const guildId = message.guild.id;

	const { canLogin, nextLogin } = await farmManager.canLogin(userId, guildId);

	if (!canLogin) {
		const now = new Date();
		const timeLeft = nextLogin ? nextLogin.getTime() - now.getTime() : 0;
		const hours = Math.floor(timeLeft / (60 * 60 * 1000));
		const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

		const embed = new EmbedBuilder()
			.setColor(0xff9900)
			.setTitle('⏰ Already Logged In Today')
			.setDescription(`You've already claimed your daily reward!\n\n⏳ Time until next login: **${hours} hours ${minutes} minutes**`)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const claimed = await farmManager.processLogin(userId, guildId);
	if (!claimed) {
		const embed = new EmbedBuilder()
			.setColor(0xff9900)
			.setTitle('⏰ Already Logged In Today')
			.setDescription('Someone may have just claimed, or something went wrong. Try again in a moment.')
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const embed = new EmbedBuilder()
		.setColor(0x00ff00)
		.setTitle('🎉 Login Successful!')
		.setDescription('You received **$10,000** and **+50 Farm XP**!')
		.setFooter({ text: 'Come back tomorrow for more rewards' })
		.setTimestamp();
	await message.reply({ embeds: [embed] });
}

module.exports = { handleFarmLogin };
