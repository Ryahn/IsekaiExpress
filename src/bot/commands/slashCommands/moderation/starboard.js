const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const path = require('path');
const { requireStarboardManager } = require('../../../utils/starboardGuards');
const {
  formatEmojiForDisplay,
  normalizeEmojiInput,
  validateEnableSettings,
  THRESHOLD_MIN,
  THRESHOLD_MAX,
} = require('../../../../../libs/starboardSettings');

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configure the server starboard')
    .addSubcommand((sub) => sub.setName('view').setDescription('View current starboard settings'))
    .addSubcommand((sub) => sub.setName('enable').setDescription('Enable the starboard'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable the starboard'))
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the starboard channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel where starred messages are posted')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('emoji')
        .setDescription('Set the star reaction emoji')
        .addStringOption((opt) =>
          opt.setName('emoji').setDescription('Unicode emoji or custom emoji').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('threshold')
        .setDescription('Set how many stars are required')
        .addIntegerOption((opt) =>
          opt
            .setName('count')
            .setDescription(`Number of stars required (${THRESHOLD_MIN}-${THRESHOLD_MAX})`)
            .setMinValue(THRESHOLD_MIN)
            .setMaxValue(THRESHOLD_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('roles')
        .setDescription('Manage roles allowed to star messages and use this command')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Allow a role to use the starboard')
            .addRoleOption((opt) => opt.setName('role').setDescription('Role to allow').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove a role from the starboard allowlist')
            .addRoleOption((opt) => opt.setName('role').setDescription('Role to remove').setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName('clear').setDescription('Clear all configured starboard roles'))
        .addSubcommand((sub) => sub.setName('list').setDescription('List configured starboard roles')),
    ),

  async execute(client, interaction) {
    const settings = await client.db.getStarboardSettings(interaction.guildId);
    if (!(await requireStarboardManager(client, interaction, settings))) return;

    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(false);

    try {
      if (subcommandGroup === 'roles') {
        return handleRoles(client, interaction, settings, subcommand);
      }

      switch (subcommand) {
        case 'view':
          return viewSettings(interaction, settings);
        case 'enable':
          return enableStarboard(client, interaction, settings);
        case 'disable':
          return disableStarboard(client, interaction);
        case 'channel':
          return setChannel(client, interaction);
        case 'emoji':
          return setEmoji(client, interaction);
        case 'threshold':
          return setThreshold(client, interaction);
        default:
          return interaction.editReply('Unknown subcommand.');
      }
    } catch (error) {
      client.logger.error('Starboard command error:', error);
      return interaction.editReply('Something went wrong while updating starboard settings.');
    }
  },
};

function buildSettingsEmbed(settings) {
  const roleLines = (settings.allowedRoleIds || []).map((id) => `<@&${id}> (\`${id}\`)`);
  return new EmbedBuilder()
    .setTitle('Starboard settings')
    .setColor(0xf1c40f)
    .addFields(
      { name: 'Enabled', value: settings.enabled ? 'Yes' : 'No', inline: true },
      {
        name: 'Channel',
        value: settings.channelId ? `<#${settings.channelId}>` : '—',
        inline: true,
      },
      { name: 'Emoji', value: formatEmojiForDisplay(settings.emoji), inline: true },
      { name: 'Threshold', value: String(settings.threshold), inline: true },
      {
        name: 'Allowed roles',
        value: roleLines.length ? roleLines.join('\n') : '— (guild managers until roles are added)',
      },
    );
}

async function viewSettings(interaction, settings) {
  await interaction.editReply({ embeds: [buildSettingsEmbed(settings)] });
}

async function enableStarboard(client, interaction, settings) {
  const errors = validateEnableSettings(settings);
  if (errors.length) {
    return interaction.editReply(`Cannot enable starboard:\n- ${errors.join('\n- ')}`);
  }

  const updated = await client.db.updateStarboardSettings(interaction.guildId, { enabled: true });
  await interaction.editReply({
    content: 'Starboard has been **enabled**.',
    embeds: [buildSettingsEmbed(updated)],
  });
}

async function disableStarboard(client, interaction) {
  const updated = await client.db.updateStarboardSettings(interaction.guildId, { enabled: false });
  await interaction.editReply({
    content: 'Starboard has been **disabled**.',
    embeds: [buildSettingsEmbed(updated)],
  });
}

async function setChannel(client, interaction) {
  const channel = interaction.options.getChannel('channel', true);
  const updated = await client.db.updateStarboardSettings(interaction.guildId, {
    channelId: channel.id,
  });
  await interaction.editReply({
    content: `Starboard channel set to ${channel}.`,
    embeds: [buildSettingsEmbed(updated)],
  });
}

async function setEmoji(client, interaction) {
  const raw = interaction.options.getString('emoji', true);
  const parsed = normalizeEmojiInput(raw);
  if (!parsed.ok) {
    return interaction.editReply(parsed.error);
  }

  const updated = await client.db.updateStarboardSettings(interaction.guildId, {
    emoji: parsed.value,
  });
  await interaction.editReply({
    content: `Starboard emoji set to ${formatEmojiForDisplay(parsed.value)}.`,
    embeds: [buildSettingsEmbed(updated)],
  });
}

async function setThreshold(client, interaction) {
  const count = interaction.options.getInteger('count', true);
  const updated = await client.db.updateStarboardSettings(interaction.guildId, {
    threshold: count,
  });
  await interaction.editReply({
    content: `Starboard threshold set to **${count}**.`,
    embeds: [buildSettingsEmbed(updated)],
  });
}

async function handleRoles(client, interaction, settings, subcommand) {
  const allowed = [...(settings.allowedRoleIds || [])];

  if (subcommand === 'list') {
    if (!allowed.length) {
      return interaction.editReply('No starboard roles configured. Guild managers can configure until roles are added.');
    }
    const lines = allowed.map((id) => `<@&${id}> (\`${id}\`)`);
    return interaction.editReply(`**Starboard roles:**\n${lines.join('\n')}`);
  }

  if (subcommand === 'clear') {
    const updated = await client.db.updateStarboardSettings(interaction.guildId, { allowedRoleIds: [] });
    return interaction.editReply({
      content: 'Cleared all starboard roles. Guild managers can configure until roles are added again.',
      embeds: [buildSettingsEmbed(updated)],
    });
  }

  const role = interaction.options.getRole('role', true);
  const roleId = role.id;

  if (subcommand === 'add') {
    if (allowed.includes(roleId)) {
      return interaction.editReply(`${role} is already allowed to use the starboard.`);
    }
    allowed.push(roleId);
    const updated = await client.db.updateStarboardSettings(interaction.guildId, { allowedRoleIds: allowed });
    return interaction.editReply({
      content: `Added ${role} to the starboard allowlist.`,
      embeds: [buildSettingsEmbed(updated)],
    });
  }

  if (subcommand === 'remove') {
    if (!allowed.includes(roleId)) {
      return interaction.editReply(`${role} is not in the starboard allowlist.`);
    }
    const next = allowed.filter((id) => id !== roleId);
    const updated = await client.db.updateStarboardSettings(interaction.guildId, { allowedRoleIds: next });
    return interaction.editReply({
      content: `Removed ${role} from the starboard allowlist.`,
      embeds: [buildSettingsEmbed(updated)],
    });
  }

  return interaction.editReply('Unknown roles subcommand.');
}
