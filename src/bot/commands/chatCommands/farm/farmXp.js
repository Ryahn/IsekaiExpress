const { EmbedBuilder } = require('discord.js');
const { farmManager } = require('../../../utils/farm/farmManager');
const { applyLimitNotesToEmbed } = require('../../../utils/farm/farmLimits');

/**
 * @param {{ createdAt: Date, eventType: string, amount: number, source: string, goldGained: number | null }} e
 */
function formatLogLine(e) {
	const t = e.createdAt.toISOString().replace('T', ' ').slice(0, 19);
	if (e.eventType === 'convert' && e.goldGained != null) {
		return `\`${t}\` · spent **${e.amount}** XP · _legacy conversion_`;
	}
	return `\`${t}\` · +**${e.amount}** XP · _${e.source}_`;
}

/**
 * Prefix: `<p>xp` (e.g. hxp) — Farm XP balance and history.
 * @param {import('discord.js').Message} message
 * @param {string[]} args
 */
async function handleFarmXp(message, args) {
	const userId = message.author.id;
	const guildId = message.guild.id;
	const prefix = await farmManager.getServerPrefix(guildId);
	const sub = args[0]?.toLowerCase();

	if (!sub) {
		const userFarm = await farmManager.getUserFarm(userId, guildId);
		const limitWarnings = await farmManager.getFarmLimitWarnings(userId, guildId);
		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle('🌾 Farm XP')
			.addFields(
				{ name: 'Balance', value: `**${userFarm.farmXp.toLocaleString()}** XP`, inline: true },
			)
			.setFooter({ text: `${prefix}xp history` })
			.setTimestamp();
		applyLimitNotesToEmbed(embed, { warnings: limitWarnings, mitigation: [] });
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

	await message.reply(
		`Unknown subcommand. Use \`${prefix}xp\` or \`${prefix}xp history\`.`,
	);
}

module.exports = { handleFarmXp };
