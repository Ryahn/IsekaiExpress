const {
	EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const config = require('../../../../config');
const { farmManager } = require('./farmManager');

const HELP_COLOR = 0x00ff00;
const PAGINATION_TIME_MS = 300000;

const BUTTON_PREV = 'farmhelp_prev';
const BUTTON_NEXT = 'farmhelp_next';

/**
 * @param {string} guildId
 * @returns {Promise<import('discord.js').EmbedBuilder[]>}
 */
async function buildFarmHelpPages(guildId) {
	const p = await farmManager.getServerPrefix(guildId);
	const total = 4;

	const page1 = new EmbedBuilder()
		.setColor(HELP_COLOR)
		.setTitle(`🌾 Farming — Getting started (1/${total})`)
		.setDescription(
			'The minigame uses **slash** settings and **prefix** commands. '
			+ `Your server prefix is \`${p}\` (change with \`/farm prefix\`).`,
		)
		.addFields(
			{
				name: 'Slash: server',
				value:
					'• `/farm server on` — turn the minigame on for this server (admins or staff)\n'
					+ '• `/farm server off` — turn it off for everyone',
				inline: false,
			},
			{
				name: 'Slash: you',
				value:
					'• `/farm enable` / `/farm disable` — opt in or out of prefix farm commands\n'
					+ '• `/farm reminders` — turn **harvest-ready** @mentions (or DMs) on or off\n'
					+ '• `/farm help` — this guide (multi-page)\n'
					+ `• \`${p}help\` or \`${p}h\` — same help via prefix`,
				inline: false,
			},
			{
				name: 'Full guide (web)',
				value: `Crop table, prices, expansion math, strategy: ${config.url}/docs/farm`,
				inline: false,
			},
		)
		.setTimestamp();

	const page2 = new EmbedBuilder()
		.setColor(HELP_COLOR)
		.setTitle(`🌾 Core commands (2/${total})`)
		.setDescription('Prefix commands (minigame on + you opted in with `/farm enable`):')
		.addFields(
			{
				name: `💰 \`${p}login\` / \`${p}daily\``,
				value: 'Receive $10,000 daily (resets at 00:00 UTC+7).',
				inline: false,
			},
			{
				name: `📊 \`${p}status\` / \`${p}stats\` / \`${p}farm\` [user]`,
				value: 'View your farm or another player\'s (mention or username).',
				inline: false,
			},
			{
				name: `🌱 \`${p}grow\` / \`${p}plant\` <crop>`,
				value:
					'Plant on **all** land slots. Uses **inventory** of that crop first (one unit per slot), '
					+ 'then **cash** at today’s buy price for any remaining slots. You do **not** need to `buy` first.',
				inline: false,
			},
			{
				name: `🌾 \`${p}harvest\` / \`${p}reap\``,
				value:
					'Harvest ready crops. **10%** yield loss per hour overdue after maturity. '
					+ 'If reminders are on, the bot may @mention you (or DM) when a crop matures.',
				inline: false,
			},
		)
		.setTimestamp();

	const page3 = new EmbedBuilder()
		.setColor(HELP_COLOR)
		.setTitle(`🌾 Market & land (3/${total})`)
		.addFields(
			{
				name: `💵 \`${p}sell\` <crop|all> <amount|all>`,
				value: 'Sell from inventory. Use `all` to sell everything of a crop (or as specified).',
				inline: false,
			},
			{
				name: `🛒 \`${p}buy\` / \`${p}purchase\` <crop> [amount|all]`,
				value:
					'Optional: add units to inventory at today’s buy price (stockpiling / trading). '
					+ '**Not required** to plant — `grow` can pay cash directly. `all` spends as much as possible.',
				inline: false,
			},
			{
				name: `🏗️ \`${p}expand\``,
				value: 'Buy more land (max **100** slots).',
				inline: false,
			},
		)
		.setTimestamp();

	const page4 = new EmbedBuilder()
		.setColor(HELP_COLOR)
		.setTitle(`🌾 Crops, info & role shop (4/${total})`)
		.addFields(
			{
				name: `📋 \`${p}crop\` [list] [sort]  ·  \`${p}crop\` <name>`,
				value: 'List crops with **list** and sort: `name`, `buy`, `sell`, `time`, `yield`. '
					+ 'Or a crop name for details. Default list uses **sell** sort.',
				inline: false,
			},
			{
				name: `ℹ️ \`${p}info\` <crop>`,
				value: 'Crop information (when used with a crop name).',
				inline: false,
			},
			{
				name: `🏪 \`${p}role list\`  ·  \`${p}role buy\` <role>`,
				value: 'List or buy server roles (if the shop is enabled for this server).',
				inline: false,
			},
		)
		.setTimestamp();

	return [page1, page2, page3, page4];
}

/**
 * @param {number} pageIndex
 * @param {number} totalPages
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildFarmHelpPaginationRow(pageIndex, totalPages) {
	return new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId(BUTTON_PREV)
				.setLabel('◀ Previous')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(pageIndex === 0),
			new ButtonBuilder()
				.setCustomId(BUTTON_NEXT)
				.setLabel('Next ▶')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(pageIndex === totalPages - 1),
		);
}

/**
 * Attaches prev/next handlers to a bot message. No-op if a single page.
 * @param {import('discord.js').Message} message
 * @param {string} userId
 * @param {import('discord.js').EmbedBuilder[]} pages
 */
function attachFarmHelpPagination(message, userId, pages) {
	if (pages.length <= 1) {
		return;
	}

	let currentPage = 0;
	const totalPages = pages.length;

	const collector = message.createMessageComponentCollector({
		filter: (i) => i.user.id === userId,
		time: PAGINATION_TIME_MS,
	});

	collector.on('collect', async (interaction) => {
		if (interaction.customId === BUTTON_PREV) {
			currentPage = Math.max(0, currentPage - 1);
		}
		else if (interaction.customId === BUTTON_NEXT) {
			currentPage = Math.min(totalPages - 1, currentPage + 1);
		}
		else {
			return;
		}

		await interaction.update({
			embeds: [pages[currentPage]],
			components: [buildFarmHelpPaginationRow(currentPage, totalPages)],
		});
	});

	collector.on('end', () => {
		message.edit({ components: [] }).catch(() => undefined);
	});
}

module.exports = {
	buildFarmHelpPages,
	attachFarmHelpPagination,
	buildFarmHelpPaginationRow,
};
