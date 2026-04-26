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

	const purchase = await farmManager.purchaseLandSlot(userId, guildId);
	if (!purchase.ok) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Error')
			.setDescription('Could not expand right now. Refresh status and try again.')
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const newSlotCount = purchase.newSlots;
	const nextPrice = newSlotCount < 100 ? calculateSlotPrice(newSlotCount) : 0;

	const embed = new EmbedBuilder()
		.setColor(0x00ff00)
		.setTitle('✅ Farm Expanded!')
		.setDescription('**+100 Farm XP**')
		.addFields(
			{ name: '🏗️ Current Land Slots', value: `${newSlotCount}/100`, inline: true },
			{ name: '💰 Cost', value: `$${purchase.price.toLocaleString()}`, inline: true },
			{ name: '💵 Remaining Balance', value: `$${purchase.remainingMoney.toLocaleString()}`, inline: true },
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
