const { ChannelType, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { farmManager } = require('../../../utils/farm/farmManager');
const {
	buildFarmHelpPages,
	attachFarmHelpPagination,
	buildFarmHelpPaginationRow,
} = require('../../../utils/farm/farmHelpPages');
const { hasGuildAdminOrStaffRole } = require('../../../utils/guildPrivileges');
const { applyLimitNotesToEmbed } = require('../../../utils/farm/farmLimits');

async function farmHelpSlashCommand(interaction) {
	if (!interaction.guild) {
		await interaction.editReply({
			content: 'Farm help can only be used in a server.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const pages = await buildFarmHelpPages(interaction.guild.id);
	const row = pages.length > 1
		? [buildFarmHelpPaginationRow(0, pages.length)]
		: [];

	await interaction.editReply({
		embeds: [pages[0]],
		components: row,
	});

	if (pages.length <= 1) {
		return;
	}

	const message = await interaction.fetchReply();
	attachFarmHelpPagination(message, interaction.user.id, pages);
}

async function farmEnableCommand(interaction, action) {
	const userId = interaction.user.id;
	const guildId = interaction.guildId;

	const enabled = action === 'enable';
	await farmManager.setFarmingEnabled(userId, guildId, enabled);

	const prefix = await farmManager.getServerPrefix(guildId);
	const message = enabled
		? `Personal farming enabled! Use \`/farm help\` or \`${prefix}help\` for commands. (Server minigame must be on: \`/farm server on\`.)`
		: 'Personal farming disabled. (Server admins/staff: use `/farm server off` to stop the minigame for everyone.)';

	await interaction.editReply({
		content: message,
		flags: MessageFlags.Ephemeral,
	});
}

async function farmServerMinigameCommand(interaction, enabled) {
	const staffRoleId = interaction.client.config?.roles?.staff;
	if (!hasGuildAdminOrStaffRole(interaction.member, staffRoleId)) {
		await interaction.editReply({
			content:
				'Only server administrators or members with the configured staff role can enable or disable the farm minigame for the server.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const guildId = interaction.guildId;
	await farmManager.setGuildMinigameEnabled(guildId, enabled);

	const prefix = await farmManager.getServerPrefix(guildId);
	const message = enabled
		? `Farm minigame is **on** for this server. Players can use \`/farm help\` or \`${prefix}help\` (personal \`/farm disable\` still opts out).`
		: 'Farm minigame is **off** for this server. Prefix farm commands are disabled for everyone.';

	await interaction.editReply({
		content: message,
		flags: MessageFlags.Ephemeral,
	});
}

async function farmServerLockChannelCommand(interaction) {
	const staffRoleId = interaction.client.config?.roles?.staff;
	if (!hasGuildAdminOrStaffRole(interaction.member, staffRoleId)) {
		await interaction.editReply({
			content:
				'Only server administrators or members with the configured staff role can set the farm command channel.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const ch = interaction.options.getChannel('channel', true);
	if (!ch.isTextBased()) {
		await interaction.editReply({
			content: '❌ Choose a text channel in this server.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const guildId = interaction.guildId;
	if (ch.guildId !== guildId) {
		await interaction.editReply({
			content: '❌ The channel must belong to this server.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await farmManager.setLockedFarmChannelId(guildId, ch.id);

	await interaction.editReply({
		content: `🔒 Farm gameplay commands are now **limited** to ${ch} (including \`/farm help\`, \`/farm enable\`, \`/farm prefix\`, and prefix commands). Staff can still use \`/farm server\` from any channel.`,
		flags: MessageFlags.Ephemeral,
	});
}

async function farmServerUnlockChannelCommand(interaction) {
	const staffRoleId = interaction.client.config?.roles?.staff;
	if (!hasGuildAdminOrStaffRole(interaction.member, staffRoleId)) {
		await interaction.editReply({
			content:
				'Only server administrators or members with the configured staff role can clear the farm command channel.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await farmManager.setLockedFarmChannelId(interaction.guildId, null);

	await interaction.editReply({
		content: '🔓 Farm commands can be used in **any channel** again (subject to the usual minigame and personal settings).',
		flags: MessageFlags.Ephemeral,
	});
}

/**
 * @returns {Promise<boolean>} false if a denial reply was sent
 */
async function assertLockedFarmChannelForGameplay(interaction) {
	if (!interaction.guild || !interaction.channel) {
		return true;
	}
	const msg = await farmManager.getWrongFarmChannelMessageIfAny(interaction.guildId, interaction.channel);
	if (!msg) {
		return true;
	}
	await interaction.editReply({
		content: `❌ ${msg}`,
		flags: MessageFlags.Ephemeral,
	});
	return false;
}

async function farmRemindersCommand(interaction) {
	const userId = interaction.user.id;
	const guildId = interaction.guildId;
	const on = interaction.options.getString('action', true) === 'on';
	await farmManager.setHarvestRemindersEnabled(userId, guildId, on);
	const prefix = await farmManager.getServerPrefix(guildId);
	await interaction.editReply({
		content: on
			? `Harvest-ready pings are **on**. The bot can @mention you in a channel (or DM you) when a crop matures. Then use \`${prefix}harvest\`.`
			: 'Harvest-ready pings are **off**. Turn them on anytime: `/farm reminders` and choose on.',
		flags: MessageFlags.Ephemeral,
	});
}

function formatFarmXpLogLine(e) {
	const t = e.createdAt.toISOString().replace('T', ' ').slice(0, 19);
	if (e.eventType === 'convert' && e.goldGained != null) {
		return `\`${t}\` · spent **${e.amount}** XP · _legacy conversion_`;
	}
	return `\`${t}\` · +**${e.amount}** XP · _${e.source}_`;
}

async function farmXpShowSlash(interaction) {
	const userId = interaction.user.id;
	const guildId = interaction.guildId;
	const prefix = await farmManager.getServerPrefix(guildId);
	const userFarm = await farmManager.getUserFarm(userId, guildId);
	const limitWarnings = await farmManager.getFarmLimitWarnings(userId, guildId);
	const embed = new EmbedBuilder()
		.setColor(0x57f287)
		.setTitle('🌾 Farm XP')
		.addFields(
			{ name: 'Balance', value: `**${userFarm.farmXp.toLocaleString()}** XP`, inline: true },
		)
		.setFooter({ text: `Prefix: ${prefix}xp · ${prefix}xp history` })
		.setTimestamp();
	applyLimitNotesToEmbed(embed, { warnings: limitWarnings, mitigation: [] });
	await interaction.editReply({ embeds: [embed] });
}

async function farmXpHistorySlash(interaction) {
	const rows = await farmManager.getFarmXpLogEntries(interaction.user.id, 10);
	if (!rows.length) {
		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x808080)
					.setTitle('Farm XP log')
					.setDescription('No entries yet.'),
			],
		});
		return;
	}
	const body = rows.map(formatFarmXpLogLine).join('\n');
	await interaction.editReply({
		embeds: [
			new EmbedBuilder()
				.setColor(0x57f287)
				.setTitle('Farm XP · last 10')
				.setDescription(body.slice(0, 3900)),
		],
	});
}

async function farmPrefixCommand(interaction) {
	const guildId = interaction.guildId;
	const newPrefix = interaction.options.getString('prefix');

	if (!newPrefix || newPrefix.length > 3 || /\s/.test(newPrefix)) {
		await interaction.editReply({
			content: '❌ Invalid prefix! Prefix must be 1-3 characters and contain no spaces.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await farmManager.setServerPrefix(guildId, newPrefix);

	await interaction.editReply({
		content: `✅ Farm command prefix changed to: \`${newPrefix}\`\nExample: \`/farm help\`, \`${newPrefix}help\`, \`${newPrefix}status\`, \`${newPrefix}grow tomato\``,
		flags: MessageFlags.Ephemeral,
	});
}

module.exports = {
	category: path.basename(__dirname),

	data: new SlashCommandBuilder()
		.setName('farm')
		.setDescription('Farming minigame settings')
		.addSubcommandGroup((group) =>
			group
				.setName('server')
				.setDescription('Server-wide minigame on/off and channel lock (admins or staff role)')
				.addSubcommand((sub) =>
					sub
						.setName('on')
						.setDescription('Enable the farm minigame for this server'),
				)
				.addSubcommand((sub) =>
					sub
						.setName('off')
						.setDescription('Disable the farm minigame for this server'),
				)
				.addSubcommand((sub) =>
					sub
						.setName('lock')
						.setDescription('Only allow farm gameplay in a specific text channel')
						.addChannelOption((opt) =>
							opt
								.setName('channel')
								.setDescription('Channel for farm commands')
								.setRequired(true)
								.addChannelTypes(
									ChannelType.GuildText,
									ChannelType.GuildAnnouncement,
								),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName('unlock')
						.setDescription('Remove the farm channel lock (all channels again)'),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('enable')
				.setDescription('Enable farming mode for yourself (personal)'),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('disable')
				.setDescription('Disable farming mode for yourself (personal)'),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('help')
				.setDescription('Farming minigame commands (multi-page guide)'),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('prefix')
				.setDescription('Change farm command prefix (default: h)')
				.addStringOption((option) =>
					option
						.setName('prefix')
						.setDescription('New prefix (1-3 characters, no spaces)')
						.setRequired(true)
						.setMinLength(1)
						.setMaxLength(3),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('reminders')
				.setDescription('Turn harvest-ready @mentions (or DMs) on or off')
				.addStringOption((option) =>
					option
						.setName('action')
						.setDescription('on = ping when crop is ready; off = no automatic ping')
						.setRequired(true)
						.addChoices(
							{ name: 'On', value: 'on' },
							{ name: 'Off', value: 'off' },
						),
				),
		)
		.addSubcommandGroup((group) =>
			group
				.setName('xp')
				.setDescription('Farm XP balance and history')
				.addSubcommand((sub) =>
					sub
						.setName('show')
						.setDescription('Farm XP balance'),
				)
				.addSubcommand((sub) =>
					sub
						.setName('history')
						.setDescription('Last 10 Farm XP earn / convert events'),
				),
		),

	async execute(client, interaction) {
		if (!interaction.inGuild()) {
			await interaction.editReply({
				content: 'Farm commands can only be used in a server.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		await farmManager.setLastFarmGuildId(interaction.user.id, interaction.guildId);
		const subcommandGroup = interaction.options.getSubcommandGroup(false);
		if (subcommandGroup === 'server') {
			const sub = interaction.options.getSubcommand();
			if (sub === 'on') {await farmServerMinigameCommand(interaction, true);}
			else if (sub === 'off') {await farmServerMinigameCommand(interaction, false);}
			else if (sub === 'lock') {await farmServerLockChannelCommand(interaction);}
			else if (sub === 'unlock') {await farmServerUnlockChannelCommand(interaction);}
			else {
				await interaction.editReply({
					content: 'Unknown farm server subcommand.',
					flags: MessageFlags.Ephemeral,
				});
			}
			return;
		}
		if (subcommandGroup === 'xp') {
			if (!(await assertLockedFarmChannelForGameplay(interaction))) {
				return;
			}
			const xsub = interaction.options.getSubcommand();
			if (xsub === 'show') {
				await farmXpShowSlash(interaction);
			}
			else if (xsub === 'history') {
				await farmXpHistorySlash(interaction);
			}
			else {
				await interaction.editReply({ content: 'Unknown /farm xp subcommand.', flags: MessageFlags.Ephemeral });
			}
			return;
		}
		const subcommand = interaction.options.getSubcommand();
		const gameplaySubcommands = new Set(['enable', 'disable', 'help', 'prefix', 'reminders']);
		if (gameplaySubcommands.has(subcommand) && !(await assertLockedFarmChannelForGameplay(interaction))) {
			return;
		}
		switch (subcommand) {
		case 'enable':
			await farmEnableCommand(interaction, 'enable');
			break;
		case 'disable':
			await farmEnableCommand(interaction, 'disable');
			break;
		case 'help':
			await farmHelpSlashCommand(interaction);
			break;
		case 'prefix':
			await farmPrefixCommand(interaction);
			break;
		case 'reminders':
			await farmRemindersCommand(interaction);
			break;
		default:
			await interaction.editReply({
				content: 'Unknown farm subcommand.',
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
