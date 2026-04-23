const { EmbedBuilder } = require('discord.js');
const { farmManager } = require('../../../utils/farm/farmManager');
const { calculateSlotPrice } = require('../../../utils/farm/cropManager');

async function handleFarmExpand(message) {
	const userId = message.author.id;
	const guildId = message.guild.id;

	const userFarm = await farmManager.getUserFarm(userId, guildId);

	if (userFarm.landSlots >= 100) {
		const embed = new EmbedBuilder()
			.setColor(0xff9900)
			.setTitle('⚠️ Maximum Capacity')
			.setDescription('You already have the maximum **100 land slots**!')
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const price = calculateSlotPrice(userFarm.landSlots);

	if (userFarm.money < price) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Insufficient Funds')
			.setDescription('Not enough money to expand land!')
			.addFields(
				{ name: '💰 Price', value: `$${price.toLocaleString()}`, inline: true },
				{ name: '💵 You Have', value: `$${userFarm.money.toLocaleString()}`, inline: true },
				{ name: '💡 Short', value: `$${(price - userFarm.money).toLocaleString()}`, inline: true },
			)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	await farmManager.updateUserFarm(userId, guildId, {
		landSlots: userFarm.landSlots + 1,
		money: userFarm.money - price,
	});

	const newSlotCount = userFarm.landSlots + 1;
	const nextPrice = newSlotCount < 100 ? calculateSlotPrice(newSlotCount) : 0;

	const embed = new EmbedBuilder()
		.setColor(0x00ff00)
		.setTitle('✅ Farm Expanded!')
		.addFields(
			{ name: '🏗️ Current Land Slots', value: `${newSlotCount}/100`, inline: true },
			{ name: '💰 Cost', value: `$${price.toLocaleString()}`, inline: true },
			{ name: '💵 Remaining Balance', value: `$${(userFarm.money - price).toLocaleString()}`, inline: true },
		);

	if (newSlotCount < 100) {
		embed.setFooter({ text: `Next slot price: $${nextPrice.toLocaleString()}` });
	}
	else {
		embed.setDescription('🎉 You\'ve reached maximum land slots!');
	}

	embed.setTimestamp();
	await message.reply({ embeds: [embed] });
}

module.exports = { handleFarmExpand };
