const { EmbedBuilder } = require('discord.js');
const { farmManager } = require('../../../utils/farm/farmManager');
const { calculateSlotPrice } = require('../../../utils/farm/cropManager');

function parseExpandArg(args) {
	const raw = (args?.[0] ?? '').toString().trim().toLowerCase();
	if (!raw) return { mode: 'count', count: 1 };
	if (raw === 'max' || raw === 'all') return { mode: 'max' };
	const cleaned = raw.replace(/[,_]/g, '');
	const n = Number.parseInt(cleaned, 10);
	if (!Number.isFinite(n) || n < 1) return { mode: 'invalid' };
	return { mode: 'count', count: n };
}

async function handleFarmExpand(message, args = []) {
	const userId = message.author.id;
	const guildId = message.guild.id;

	const parsed = parseExpandArg(args);
	if (parsed.mode === 'invalid') {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Invalid Amount')
			.setDescription('Usage: `expand [amount|max]`\nExamples: `expand`, `expand 5`, `expand max`')
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

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

	const countArg = parsed.mode === 'max' ? 'max' : parsed.count;
	const purchase = await farmManager.purchaseLandSlots(userId, guildId, countArg);

	if (!purchase.ok) {
		if (purchase.reason === 'funds') {
			const nextPrice = purchase.nextPrice ?? calculateSlotPrice(userFarm.landSlots);
			const money = purchase.money ?? userFarm.money;
			const embed = new EmbedBuilder()
				.setColor(0xff0000)
				.setTitle('❌ Insufficient Funds')
				.setDescription(
					parsed.mode === 'max'
						? 'You don\'t have enough money to buy even one more slot.'
						: `Not enough money to buy **${parsed.count}** slot${parsed.count === 1 ? '' : 's'}.`,
				)
				.addFields(
					{ name: '💰 Next Slot Price', value: `$${nextPrice.toLocaleString()}`, inline: true },
					{ name: '💵 You Have', value: `$${money.toLocaleString()}`, inline: true },
					{ name: '💡 Short', value: `$${Math.max(0, nextPrice - money).toLocaleString()}`, inline: true },
				)
				.setTimestamp();
			await message.reply({ embeds: [embed] });
			return;
		}
		if (purchase.reason === 'max') {
			const embed = new EmbedBuilder()
				.setColor(0xff9900)
				.setTitle('⚠️ Maximum Capacity')
				.setDescription('You already have the maximum **100 land slots**!')
				.setTimestamp();
			await message.reply({ embeds: [embed] });
			return;
		}
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Error')
			.setDescription('Could not expand right now. Refresh status and try again.')
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const { slotsBought, newSlots, totalPrice, remainingMoney, nextPrice } = purchase;
	const xpGained = slotsBought * 100;

	const title = slotsBought === 1 ? '✅ Farm Expanded!' : `✅ Farm Expanded! (+${slotsBought} slots)`;
	const embed = new EmbedBuilder()
		.setColor(0x00ff00)
		.setTitle(title)
		.setDescription(`**+${xpGained.toLocaleString()} Farm XP**`)
		.addFields(
			{ name: '🏗️ Land Slots', value: `${newSlots}/100`, inline: true },
			{ name: '💰 Total Cost', value: `$${totalPrice.toLocaleString()}`, inline: true },
			{ name: '💵 Remaining Balance', value: `$${remainingMoney.toLocaleString()}`, inline: true },
		);

	if (newSlots < 100) {
		embed.setFooter({ text: `Next slot price: $${nextPrice.toLocaleString()}` });
	}
	else {
		embed.addFields({ name: '\u200b', value: '🎉 You\'ve reached maximum land slots!', inline: false });
	}

	embed.setTimestamp();
	await message.reply({ embeds: [embed] });
}

module.exports = { handleFarmExpand };
