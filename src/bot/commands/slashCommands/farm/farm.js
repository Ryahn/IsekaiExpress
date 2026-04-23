const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const { farmManager } = require('../../../utils/farm/farmManager');

async function farmEnableCommand(interaction, action) {
	const userId = interaction.user.id;
	const guildId = interaction.guildId;

	const enabled = action === 'enable';
	await farmManager.setFarmingEnabled(userId, guildId, enabled);

	const prefix = await farmManager.getServerPrefix(guildId);
	const message = enabled
		? `Personal farming enabled! Use \`${prefix}help\` for commands. (Server minigame must be on: \`/farm server on\`.)`
		: 'Personal farming disabled. (Admins: use `/farm server off` to stop the minigame for everyone.)';

	await interaction.editReply({
		content: message,
		ephemeral: true,
	});
}

async function farmServerMinigameCommand(interaction, enabled) {
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await interaction.editReply({
			content: 'Only administrators can enable or disable the farm minigame for the server.',
			ephemeral: true,
		});
		return;
	}

	const guildId = interaction.guildId;
	await farmManager.setGuildMinigameEnabled(guildId, enabled);

	const prefix = await farmManager.getServerPrefix(guildId);
	const message = enabled
		? `Farm minigame is **on** for this server. Players can use \`${prefix}help\` (personal \`/farm disable\` still opts out).`
		: 'Farm minigame is **off** for this server. Prefix farm commands are disabled for everyone.';

	await interaction.editReply({
		content: message,
		ephemeral: true,
	});
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
		content: `✅ Farm command prefix changed to: \`${newPrefix}\`\nExample: \`${newPrefix}help\`, \`${newPrefix}status\`, \`${newPrefix}grow tomato\``,
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
				.setDescription('Server-wide minigame on/off (administrators)')
				.addSubcommand((sub) =>
					sub
						.setName('on')
						.setDescription('Enable the farm minigame for this server'),
				)
				.addSubcommand((sub) =>
					sub
						.setName('off')
						.setDescription('Disable the farm minigame for this server'),
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
			else {
				await interaction.editReply({
					content: 'Unknown farm server subcommand.',
					ephemeral: true,
				});
			}
			return;
		}
		const subcommand = interaction.options.getSubcommand();
		switch (subcommand) {
		case 'enable':
			await farmEnableCommand(interaction, 'enable');
			break;
		case 'disable':
			await farmEnableCommand(interaction, 'disable');
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
