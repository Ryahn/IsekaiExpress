const { EmbedBuilder } = require('discord.js');
const config = require('../../../../../config');
const { farmManager } = require('../../../utils/farm/farmManager');
const { convertFarmXpToGold, FARM_XP_PER_GOLD } = require('../../../utils/farm/farmXpConvert');

/**
 * @param {{ createdAt: Date, eventType: string, amount: number, source: string, goldGained: number | null }} e
 */
function formatLogLine(e) {
	const t = e.createdAt.toISOString().replace('T', ' ').slice(0, 19);
	if (e.eventType === 'convert' && e.goldGained != null) {
		return `\`${t}\` · spent **${e.amount}** XP → **+${e.goldGained}**g`;
	}
	return `\`${t}\` · +**${e.amount}** XP · _${e.source}_`;
}

/**
 * Prefix: `<p>xp` (e.g. hxp) — Farm XP balance, convert to TCG gold, history.
 * @param {import('discord.js').Message} message
 * @param {string[]} args
 */
async function handleFarmXp(message, args) {
	const userId = message.author.id;
	const guildId = message.guild.id;
	const prefix = await farmManager.getServerPrefix(guildId);
	const dailyCap = config.farm?.xpDailyConvertCap ?? 500;
	const sub = args[0]?.toLowerCase();

	if (!sub) {
		const userFarm = await farmManager.getUserFarm(userId, guildId);
		const remaining = Math.max(0, dailyCap - userFarm.farmXpConvertedToday);
		const goldEq = Math.floor(userFarm.farmXp / FARM_XP_PER_GOLD);
		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle('🌾 Farm XP')
			.addFields(
				{ name: 'Balance', value: `**${userFarm.farmXp.toLocaleString()}** XP`, inline: true },
				{ name: '≈ Full gold value', value: `**${goldEq}**g · _50 XP = 1g_`, inline: true },
				{ name: 'Converted today (UTC+7)', value: `**${userFarm.farmXpConvertedToday}** / **${dailyCap}** XP`, inline: true },
				{ name: 'Under cap today', value: `**${remaining}** XP left`, inline: true },
			)
			.setFooter({ text: `${prefix}xp convert <n> · ${prefix}xp convert all · ${prefix}xp history` })
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	if (sub === 'history') {
		const rows = await farmManager.getFarmXpLogEntries(userId, 10);
		if (!rows.length) {
			const embed = new EmbedBuilder()
				.setColor(0x808080)
				.setTitle('Farm XP log')
				.setDescription('No entries yet.');
			await message.reply({ embeds: [embed] });
			return;
		}
		const body = rows.map(formatLogLine).join('\n');
		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle('Farm XP · last 10')
			.setDescription(body.slice(0, 3900));
		await message.reply({ embeds: [embed] });
		return;
	}

	if (sub === 'convert') {
		const modeArg = args[1];
		if (modeArg == null || modeArg === '') {
			await message.reply(
				`Usage: \`${prefix}xp convert <amount>\` or \`${prefix}xp convert all\``,
			);
			return;
		}
		const modeLower = String(modeArg).toLowerCase();
		/** @type {'all' | 'amount'} */
		let mode;
		/** @type {number | undefined} */
		let amount;
		if (modeLower === 'all') {
			mode = 'all';
		}
		else {
			mode = 'amount';
			amount = parseInt(String(modeArg), 10);
			if (!Number.isFinite(amount)) {
				await message.reply(
					`Usage: \`${prefix}xp convert <amount>\` or \`${prefix}xp convert all\``,
				);
				return;
			}
		}

		const res = await convertFarmXpToGold(
			message.client,
			message.author,
			mode === 'all' ? { mode: 'all' } : { mode: 'amount', amount: amount ?? 0 },
		);

		if (!res.ok) {
			const embed = new EmbedBuilder()
				.setColor(0xed4245)
				.setTitle('Cannot convert')
				.setDescription(res.error);
			await message.reply({ embeds: [embed] });
			return;
		}

		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle('Converted Farm XP')
			.setDescription(
				`Spent **${res.xpSpent}** Farm XP → **+${res.goldGained}** TCG gold\n`
				+ `Farm XP: **${res.newFarmXp.toLocaleString()}** · Gold: **${res.newGold.toLocaleString()}**\n`
				+ `Today (UTC+7): **${res.convertedToday}** / **${res.dailyCap}** XP converted · **${res.remainingCapAfter}** XP left under cap`,
			)
			.setTimestamp();
		await message.reply({ embeds: [embed] });
		return;
	}

	await message.reply(
		`Unknown subcommand. Use \`${prefix}xp\`, \`${prefix}xp convert\`, or \`${prefix}xp history\`.`,
	);
}

module.exports = { handleFarmXp };
