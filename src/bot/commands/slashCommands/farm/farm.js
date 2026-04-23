const { SlashCommandBuilder, ChannelType } = require('discord.js');
const path = require('path');
const { farmManager } = require('../../../utils/farm/farmManager');
const {
	buildFarmHelpPages,
	attachFarmHelpPagination,
	buildFarmHelpPaginationRow,
} = require('../../../utils/farm/farmHelpPages');
const { hasGuildAdminOrStaffRole } = require('../../../utils/guildPrivileges');

async function farmHelpSlashCommand(interaction) {
	if (!interaction.guild) {
		await interaction.editReply({
			content: 'Farm help can only be used in a server.',
			ephemeral: true,
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
		ephemeral: true,
	});
}

async function farmServerMinigameCommand(interaction, enabled) {
	const staffRoleId = interaction.client.config?.roles?.staff;
	if (!hasGuildAdminOrStaffRole(interaction.member, staffRoleId)) {
		await interaction.editReply({
			content:
				'Only server administrators or members with the configured staff role can enable or disable the farm minigame for the server.',
			ephemeral: true,
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
		ephemeral: true,
	});
}

async function farmServerLockChannelCommand(interaction) {
	const staffRoleId = interaction.client.config?.roles?.staff;
	if (!hasGuildAdminOrStaffRole(interaction.member, staffRoleId)) {
		await interaction.editReply({
			content:
				'Only server administrators or members with the configured staff role can set the farm command channel.',
			ephemeral: true,
		});
		return;
	}

	const ch = interaction.options.getChannel('channel', true);
	if (!ch.isTextBased()) {
		await interaction.editReply({
			content: '❌ Choose a text channel in this server.',
			ephemeral: true,
		});
		return;
	}

	const guildId = interaction.guildId;
	if (ch.guildId !== guildId) {
		await interaction.editReply({
			content: '❌ The channel must belong to this server.',
			ephemeral: true,
		});
		return;
	}

	await farmManager.setLockedFarmChannelId(guildId, ch.id);

	await interaction.editReply({
		content: `🔒 Farm gameplay commands are now **limited** to ${ch} (including \`/farm help\`, \`/farm enable\`, \`/farm prefix\`, and prefix commands). Staff can still use \`/farm server\` from any channel.`,
		ephemeral: true,
	});
}

async function farmServerUnlockChannelCommand(interaction) {
	const staffRoleId = interaction.client.config?.roles?.staff;
	if (!hasGuildAdminOrStaffRole(interaction.member, staffRoleId)) {
		await interaction.editReply({
			content:
				'Only server administrators or members with the configured staff role can clear the farm command channel.',
			ephemeral: true,
		});
		return;
	}

	await farmManager.setLockedFarmChannelId(interaction.guildId, null);

	await interaction.editReply({
		content: '🔓 Farm commands can be used in **any channel** again (subject to the usual minigame and personal settings).',
		ephemeral: true,
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
		ephemeral: true,
	});
	return false;
}

async function farmPrefixCommand(interaction) {
	const guildId = interaction.guildId;
	const newPrefix = interaction.options.getString('prefix');

	if (!newPrefix || newPrefix.length > 3 || /\s/.test(newPrefix)) {
		await interaction.editReply({
			content: '❌ Invalid prefix! Prefix must be 1-3 characters and contain no spaces.',
			ephemeral: true,
		});
		return;
	}

	await farmManager.setServerPrefix(guildId, newPrefix);

	await interaction.editReply({
		content: `✅ Farm command prefix changed to: \`${newPrefix}\`\nExample: \`/farm help\`, \`${newPrefix}help\`, \`${newPrefix}status\`, \`${newPrefix}grow tomato\``,
		ephemeral: true,
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
		),

	async execute(client, interaction) {
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
					ephemeral: true,
				});
			}
			return;
		}
		const subcommand = interaction.options.getSubcommand();
		const gameplaySubcommands = new Set(['enable', 'disable', 'help', 'prefix']);
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
		default:
			await interaction.editReply({
				content: 'Unknown farm subcommand.',
				ephemeral: true,
			});
		}
	},
};
