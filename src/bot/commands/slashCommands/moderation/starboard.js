const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const path = require('path');
const { requireStarboardManager, requireStarboardAdmin } = require('../../../utils/starboardGuards');
const { manualAddToStarboard } = require('../../../../../libs/starboardManager');
const {
  formatEmojiForDisplay,
  normalizeEmojiInput,
  validateEnableSettings,
  parseMessageReference,
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
        .setName('add')
        .setDescription('Manually add a message to the starboard')
        .addStringOption((opt) =>
          opt
            .setName('message_id')
            .setDescription('Message ID or Discord message link')
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel the message is in (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildForum),
        ),
    )
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
        .setDescription('Manage roles allowed to star messages and configure the starboard')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Allow a role to star messages and manage settings')
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
    )
    .addSubcommandGroup((group) =>
      group
        .setName('admin_role')
        .setDescription('Manage roles allowed to manually add messages via /starboard add')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Allow a role to manually add messages to the starboard')
            .addRoleOption((opt) => opt.setName('role').setDescription('Admin role to allow').setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Remove a role from the starboard admin allowlist')
            .addRoleOption((opt) => opt.setName('role').setDescription('Admin role to remove').setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName('clear').setDescription('Clear all starboard admin roles'))
        .addSubcommand((sub) => sub.setName('list').setDescription('List configured starboard admin roles')),
    ),

  async execute(client, interaction) {
    const settings = await client.db.getStarboardSettings(interaction.guildId);
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(false);

    try {
      if (subcommandGroup === 'roles') {
        if (!(await requireStarboardManager(client, interaction, settings))) return;
        return handleRoles(client, interaction, settings, subcommand);
      }

      if (subcommandGroup === 'admin_role') {
        if (!(await requireStarboardManager(client, interaction, settings))) return;
        return handleAdminRoles(client, interaction, settings, subcommand);
      }

      if (subcommand === 'add') {
        if (!(await requireStarboardAdmin(client, interaction, settings))) return;
        return addMessage(client, interaction, settings);
      }

      if (!(await requireStarboardManager(client, interaction, settings))) return;

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
  const adminRoleLines = (settings.adminRoleIds || []).map((id) => `<@&${id}> (\`${id}\`)`);
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
        name: 'Star roles',
        value: roleLines.length ? roleLines.join('\n') : '— (guild managers until roles are added)',
      },
      {
        name: 'Admin roles',
        value: adminRoleLines.length
          ? adminRoleLines.join('\n')
          : '— (starboard managers until admin roles are added)',
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

async function addMessage(client, interaction, settings) {
  const raw = interaction.options.getString('message_id', true);
  const parsed = parseMessageReference(raw);
  if (!parsed.ok) {
    return interaction.editReply(parsed.error);
  }

  if (parsed.guildId && parsed.guildId !== interaction.guildId) {
    return interaction.editReply('That message link is from a different server.');
  }

  const channel =
    interaction.options.getChannel('channel') ||
    (parsed.channelId
      ? await interaction.guild.channels.fetch(parsed.channelId).catch(() => null)
      : interaction.channel);

  if (!channel || !channel.isTextBased?.()) {
    return interaction.editReply('Could not find a valid text channel for that message.');
  }

  const sourceMessage = await channel.messages.fetch(parsed.messageId).catch(() => null);
  if (!sourceMessage) {
    return interaction.editReply('Could not find that message. Check the ID, link, and channel.');
  }

  try {
    const result = await manualAddToStarboard(client, interaction.guild, sourceMessage, settings);
    const action = result.updated ? 'Updated' : 'Added';
    return interaction.editReply(
      `${action} [message](${sourceMessage.url}) on the starboard with **${result.starCount}** star(s).`,
    );
  } catch (error) {
    return interaction.editReply(error.message || 'Could not add that message to the starboard.');
  }
}

async function handleRoleList(interaction, roleIds, emptyMessage, title) {
  if (!roleIds.length) {
    return interaction.editReply(emptyMessage);
  }
  const lines = roleIds.map((id) => `<@&${id}> (\`${id}\`)`);
  return interaction.editReply(`**${title}:**\n${lines.join('\n')}`);
}

async function handleRoles(client, interaction, settings, subcommand) {
  const allowed = [...(settings.allowedRoleIds || [])];

  if (subcommand === 'list') {
    return handleRoleList(
      interaction,
      allowed,
      'No starboard roles configured. Guild managers can configure until roles are added.',
      'Starboard roles',
    );
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

async function handleAdminRoles(client, interaction, settings, subcommand) {
  const adminRoles = [...(settings.adminRoleIds || [])];

  if (subcommand === 'list') {
    return handleRoleList(
      interaction,
      adminRoles,
      'No starboard admin roles configured. Starboard managers can manually add until admin roles are set.',
      'Starboard admin roles',
    );
  }

  if (subcommand === 'clear') {
    const updated = await client.db.updateStarboardSettings(interaction.guildId, { adminRoleIds: [] });
    return interaction.editReply({
      content: 'Cleared all starboard admin roles. Starboard managers can manually add until admin roles are set again.',
      embeds: [buildSettingsEmbed(updated)],
    });
  }

  const role = interaction.options.getRole('role', true);
  const roleId = role.id;

  if (subcommand === 'add') {
    if (adminRoles.includes(roleId)) {
      return interaction.editReply(`${role} is already a starboard admin role.`);
    }
    adminRoles.push(roleId);
    const updated = await client.db.updateStarboardSettings(interaction.guildId, { adminRoleIds: adminRoles });
    return interaction.editReply({
      content: `Added ${role} as a starboard admin role (can use \`/starboard add\`).`,
      embeds: [buildSettingsEmbed(updated)],
    });
  }

  if (subcommand === 'remove') {
    if (!adminRoles.includes(roleId)) {
      return interaction.editReply(`${role} is not a starboard admin role.`);
    }
    const next = adminRoles.filter((id) => id !== roleId);
    const updated = await client.db.updateStarboardSettings(interaction.guildId, { adminRoleIds: next });
    return interaction.editReply({
      content: `Removed ${role} from the starboard admin roles.`,
      embeds: [buildSettingsEmbed(updated)],
    });
  }

  return interaction.editReply('Unknown admin_role subcommand.');
}
