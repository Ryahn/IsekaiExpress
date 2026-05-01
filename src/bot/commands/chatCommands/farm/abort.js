const { EmbedBuilder } = require('discord.js');
const { farmManager } = require('../../../utils/farm/farmManager');
const { formatTime } = require('../../../utils/farm/cropManager');

function isConfirmToken(arg) {
	if (!arg) return false;
	const v = String(arg).toLowerCase();
	return v === 'confirm' || v === 'yes' || v === 'y';
}

async function handleFarmAbort(message, args = [], { commandName = 'abort' } = {}) {
	const userId = message.author.id;
	const guildId = message.guild.id;
	const prefix = await farmManager.getServerPrefix(guildId);

	const confirmUsage = commandName === 'abort' || commandName === 'uproot'
		? `${prefix}${commandName} confirm`
		: `${prefix}${commandName} reset confirm`;

	const userFarm = await farmManager.getUserFarm(userId, guildId);
	if (!userFarm.currentCrop || !userFarm.plantedAt) {
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Nothing To Abort')
			.setDescription(`You don't have any crop planted.\n\n💡 Use \`${prefix}grow <crop name>\` to plant.`)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const crop = userFarm.currentCrop;
	const growthTimeMs = Number(crop.growthTime) || 0;
	const plantedAtMs = new Date(userFarm.plantedAt).getTime();
	const elapsed = Math.max(0, Date.now() - plantedAtMs);
	const refundFraction = growthTimeMs > 0
		? Math.max(0, Math.min(1, 1 - (elapsed / growthTimeMs)))
		: 0;
	const refundPct = Math.round(refundFraction * 100);
	const timeLeft = Math.max(0, growthTimeMs - elapsed);

	const cashPaid = Number(userFarm.plantedCashPaid || 0);
	const seedsStaked = Number(userFarm.plantedSeedsFromInv || 0);
	const previewCashRefund = Math.floor(cashPaid * refundFraction);
	const previewSeedRefund = Math.floor(seedsStaked * refundFraction);

	if (!isConfirmToken(args[0])) {
		const description = refundFraction > 0
			? `Uproot your **${crop.displayName}** now to free the land. Refund is **scaled by remaining growth time** — the sooner you abort, the more you get back.`
			: `Your **${crop.displayName}** is already mature (or overdue) — aborting now gives **no refund**. Consider harvesting instead: \`${prefix}harvest\`.`;

		const embed = new EmbedBuilder()
			.setColor(0xff9900)
			.setTitle('⚠️ Confirm Crop Abort')
			.setDescription(description)
			.addFields(
				{ name: '🌾 Crop', value: crop.displayName, inline: true },
				{ name: '⏳ Time Left', value: timeLeft > 0 ? formatTime(timeLeft) : 'Ready / Overdue', inline: true },
				{ name: '↩️ Refund', value: `${refundPct}%`, inline: true },
				{ name: '💵 Cash Refund', value: `$${previewCashRefund.toLocaleString()}`, inline: true },
				{ name: '🌱 Seed Refund', value: `${previewSeedRefund} ${crop.displayName}`, inline: true },
				{ name: '\u200b', value: '\u200b', inline: true },
			)
			.setFooter({ text: `Type \`${confirmUsage}\` within a minute to proceed.` })
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const result = await farmManager.abortCrop(userId, guildId);
	if (!result.ok) {
		if (result.reason === 'no_crop') {
			const embed = new EmbedBuilder()
				.setColor(0xff0000)
				.setTitle('❌ Nothing To Abort')
				.setDescription('You don\'t have any crop planted.')
				.setTimestamp();
			await message.reply({ embeds: [embed] });
			return;
		}
		const embed = new EmbedBuilder()
			.setColor(0xff0000)
			.setTitle('❌ Error')
			.setDescription('Could not abort right now. Refresh status and try again.')
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	const finalRefundPct = Math.round(result.refundFraction * 100);
	const embed = new EmbedBuilder()
		.setColor(result.refundFraction > 0 ? 0x00b894 : 0x999999)
		.setTitle(`🪓 Uprooted ${result.crop.displayName}`)
		.setDescription(
			result.refundFraction > 0
				? `Prorated refund at **${finalRefundPct}%** of growth remaining.`
				: 'Crop was already mature — no refund issued.',
		)
		.addFields(
			{ name: '💵 Cash Refunded', value: `$${result.cashRefunded.toLocaleString()}`, inline: true },
			{ name: '🌱 Seeds Refunded', value: `${result.seedsRefunded} ${result.crop.displayName}`, inline: true },
			{ name: '💰 New Balance', value: `$${result.remainingMoney.toLocaleString()}`, inline: true },
		)
		.setFooter({ text: `Use ${prefix}grow <crop name> to plant again.` })
		.setTimestamp();
	await message.reply({ embeds: [embed] });
}

module.exports = { handleFarmAbort };
