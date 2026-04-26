const { EmbedBuilder } = require('discord.js');
const { farmManager, getPlantingPlan } = require('../../../utils/farm/farmManager');
const { getCrop, formatTime, getDailySellPrice } = require('../../../utils/farm/cropManager');

async function handleFarmGrow(message, args) {
	const userId = message.author.id;
	const guildId = message.guild.id;
	const cropName = args.join(' ');
	const prefix = await farmManager.getServerPrefix(guildId);

	if (!cropName) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Error')
			.setDescription(`Please specify a crop name!\n\n💡 Example: \`${prefix}grow tomato\``)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const crop = getCrop(cropName);
	if (!crop) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Crop Not Found')
			.setDescription(`Crop **${cropName}** not found.\n\n💡 Use \`${prefix}info <crop name>\` to see available crops.`)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const userFarm = await farmManager.getUserFarm(userId, guildId);

	if (userFarm.currentCrop) {
		const embed = new EmbedBuilder()
			.setColor(0xff9900)
			.setTitle('⚠️ Already Growing')
			.setDescription(`You're already growing **${userFarm.currentCrop.displayName}**!\n\n💡 Harvest first before planting new crops.\nUse \`${prefix}harvest\``)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const plan = getPlantingPlan(userFarm, crop);
	const { cashCost, fromInv, buyPrice, landSlots: slotCount } = plan;
	const inStock = userFarm.inventory[crop.name] || 0;

	if (userFarm.money < cashCost) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Insufficient Funds')
			.setDescription(
				cashCost > 0
					? (fromInv > 0
						? `You have **${inStock}** **${crop.displayName}** in stock (used **${fromInv}** toward **${slotCount}** land slots), but you still need cash for the rest.`
						: 'Not enough money to pay for the land slots you need.')
					: 'Not enough to plant. (This should not happen — tell staff.)',
			)
			.addFields(
				{ name: '💰 Cash need', value: `$${cashCost.toLocaleString()}`, inline: true },
				{ name: '💵 You have', value: `$${userFarm.money.toLocaleString()}`, inline: true },
				{ name: '💡 Short', value: `$${(cashCost - userFarm.money).toLocaleString()}`, inline: true },
			)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const result = await farmManager.plantCrop(userId, guildId, crop);

	if (!result.success) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Error')
			.setDescription('An error occurred while planting. Please try again.')
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const cashPaid = result.cashPaid;
	const fromInventory = result.fromInventory;
	const expectedYield = crop.yield * userFarm.landSlots;
	const sellPrice = getDailySellPrice(crop.name);
	const expectedValue = expectedYield * sellPrice;
	const netProfit = expectedValue - cashPaid;
	const fromInvLine
		= fromInventory > 0
			? `**${fromInventory}** from inventory (covers **${fromInventory}** of **${userFarm.landSlots}** slots)`
			: 'None (paid cash for all slots)';

	const embed = new EmbedBuilder()
		.setColor(0x00ff00)
		.setTitle(`✅ Planted ${crop.displayName}!`)
		.addFields(
			{ name: '🏗️ Land Slots', value: `${userFarm.landSlots}`, inline: true },
			{ name: '📦 From inventory', value: fromInvLine, inline: true },
			{ name: '💵 Cash spent', value: `$${cashPaid.toLocaleString()}`, inline: true },
			{ name: '⏰ Growth Time', value: formatTime(crop.growthTime), inline: true },
			{ name: '🌾 Expected Yield', value: `${expectedYield} units`, inline: true },
			{ name: '💵 Expected value', value: `$${expectedValue.toLocaleString()}`, inline: true },
			{ name: '💰 Net vs cash (est.)', value: `$${netProfit.toLocaleString()}`, inline: true },
			{ name: '💸 Buy (per unit/slot today)', value: `$${buyPrice}/slot`, inline: true },
			{ name: '💰 Sell (per unit today)', value: `$${sellPrice}/unit`, inline: true },
			{ name: '\u200b', value: '\u200b', inline: true },
		)
		.setFooter({ text: '+5 Farm XP · ⚠️ 10% yield loss per hour overdue!' })
		.setTimestamp();
	await message.reply({ embeds: [embed] });
}

module.exports = { handleFarmGrow };
