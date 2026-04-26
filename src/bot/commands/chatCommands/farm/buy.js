const { EmbedBuilder } = require('discord.js');
const { farmManager } = require('../../../utils/farm/farmManager');
const { getCrop, getDailyBuyPrice } = require('../../../utils/farm/cropManager');

async function handleFarmBuy(message, args) {
	const userId = message.author.id;
	const guildId = message.guild.id;
	const prefix = await farmManager.getServerPrefix(guildId);

	if (args.length === 0) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Error')
			.setDescription(`Please specify a crop name!\n\n💡 **Examples:**\n\`${prefix}buy tomato 10\` - buy 10 units\n\`${prefix}buy tomato all\` - buy with all money`)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	let cropName;
	let quantityArg = '1';

	if (args.length > 1) {
		quantityArg = args[args.length - 1];
		cropName = args.slice(0, -1).join(' ');
	}
	else {
		cropName = args.join(' ');
	}

	const crop = getCrop(cropName);
	if (!crop) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Crop Not Found')
			.setDescription(`Crop **${cropName}** not found.\n\n💡 Use \`${prefix}info all\` to see available crops.`)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const userFarm = await farmManager.getUserFarm(userId, guildId);

	const dailyPrice = getDailyBuyPrice(crop.name);

	let buyQuantity;
	if (quantityArg.toLowerCase() === 'all') {
		buyQuantity = Math.floor(userFarm.money / dailyPrice);

		if (buyQuantity === 0) {
			const embed = new EmbedBuilder()
				.setColor(0xff0000)
				.setTitle('❌ Insufficient Funds')
				.setDescription(`Not enough money to buy even 1 unit of **${crop.displayName}**!`)
				.addFields(
					{ name: '💰 Price', value: `$${dailyPrice} / unit`, inline: true },
					{ name: '💵 Your Balance', value: `$${userFarm.money.toLocaleString()}`, inline: true },
				)
				.setTimestamp();
			await message.reply({ embeds: [embed] });
			return;
		}
	}
	else {
		const quantity = parseInt(quantityArg, 10);
		if (Number.isNaN(quantity) || quantity <= 0) {
			const embed = new EmbedBuilder()
				.setColor(0xff0000)
				.setTitle('❌ Invalid Quantity')
				.setDescription('Please enter a positive number or `all`.')
				.setTimestamp();
			await message.reply({ embeds: [embed] });
			return;
		}
		buyQuantity = quantity;
	}

	const totalCost = dailyPrice * buyQuantity;

	if (userFarm.money < totalCost) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Insufficient Funds')
			.addFields(
				{ name: '💰 Need', value: `$${totalCost.toLocaleString()}`, inline: true },
				{ name: '💵 You Have', value: `$${userFarm.money.toLocaleString()}`, inline: true },
				{ name: '💡 Short', value: `$${(totalCost - userFarm.money).toLocaleString()}`, inline: true },
			)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const purchase = await farmManager.purchaseShopSeeds(userId, guildId, crop, buyQuantity);
	if (!purchase.ok) {
		if (purchase.reason === 'funds') {
			const embed = new EmbedBuilder()
				.setColor(0xff0000)
				.setTitle('❌ Insufficient Funds')
				.setDescription('Your balance changed — try again with a smaller amount.')
				.setTimestamp();
			await message.reply({ embeds: [embed] });
			return;
		}
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Error')
			.setDescription('Could not complete purchase. Please try again.')
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const embed = new EmbedBuilder()
		.setColor(0x00ff00)
		.setTitle(`✅ Purchased ${crop.displayName}!`)
		.addFields(
			{ name: '📦 Quantity', value: `${purchase.buyQuantity} units`, inline: true },
			{ name: '💰 Unit Price', value: `$${purchase.dailyPrice}`, inline: true },
			{ name: '💵 Total Cost', value: `$${purchase.totalCost.toLocaleString()}`, inline: true },
			{ name: '💰 Remaining Balance', value: `$${purchase.remainingMoney.toLocaleString()}`, inline: false },
		)
		.setFooter({ text: 'Today\'s market price' })
		.setTimestamp();
	await message.reply({ embeds: [embed] });
}

module.exports = { handleFarmBuy };
