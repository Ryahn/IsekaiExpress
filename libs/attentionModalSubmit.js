const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');

const MAX_URL = 2000;
const MAX_REASON = 4000;

function truncate(s, max) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function canSubmitModLane(member, client) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const mod = typeof client.config?.roles?.mod === 'string' ? client.config.roles.mod.trim() : '';
  const up =
    typeof client.config?.roles?.uploader === 'string' ? client.config.roles.uploader.trim() : '';
  if (mod && member.roles.cache.has(mod)) return true;
  if (up && member.roles.cache.has(up)) return true;
  return false;
}

function canSubmitStaffLane(member, client) {
  if (!member) return false;
  return hasGuildAdminOrStaffRole(member, client.config?.roles?.staff);
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleAttentionModalSubmit(client, interaction) {
  const customId = interaction.customId || '';
  const lane = customId === 'attention:form:mod' ? 'mod' : customId === 'attention:form:staff' ? 'staff' : null;
  if (!lane) return;

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    return interaction.editReply({ content: 'This can only be used in a server.' });
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    return interaction.editReply({ content: 'Could not load your member profile.' });
  }

  if (lane === 'mod' && !canSubmitModLane(member, client)) {
    return interaction.editReply({
      content: 'You need the mod role, uploader role, or Administrator to use this queue.',
    });
  }
  if (lane === 'staff' && !canSubmitStaffLane(member, client)) {
    return interaction.editReply({
      content: 'You need the staff role or Administrator to use this queue.',
    });
  }

  const threadUrl = truncate(interaction.fields.getTextInputValue('attention_thread'), MAX_URL);
  const profileUrl = truncate(interaction.fields.getTextInputValue('attention_profile'), MAX_URL);
  const reason = truncate(interaction.fields.getTextInputValue('attention_reason'), MAX_REASON);

  if (!threadUrl || !profileUrl || !reason) {
    return interaction.editReply({ content: 'Thread URL, profile URL, and reason are all required.' });
  }

  const cfg = await client.db.getGuildConfigurable(interaction.guildId);
  const destId = cfg?.attention_channel_id != null ? String(cfg.attention_channel_id).trim() : '';
  if (!destId) {
    return interaction.editReply({
      content: 'No attention channel is configured yet. A staff member must run `/attention config` first.',
    });
  }

  const id = await client.db.insertAttentionRequest({
    guild_id: interaction.guildId,
    author_id: interaction.user.id,
    lane,
    thread_url: threadUrl,
    profile_url: profileUrl,
    reason,
    status: 'pending',
    source_channel_id: interaction.channelId ? String(interaction.channelId) : null,
  });

  const channel = await guild.channels.fetch(destId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return interaction.editReply({
      content:
        'The configured attention channel is missing or is not a text channel. Ask staff to update `/attention config`.',
    });
  }

  const queueLabel = lane === 'mod' ? 'Mod' : 'Staff';
  const embed = new EmbedBuilder()
    .setTitle('Attention request')
    .setColor(lane === 'mod' ? 0x5865f2 : 0xf0b232)
    .addFields(
      { name: 'Queue', value: `**${queueLabel}**`, inline: true },
      { name: 'Submitted by', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Thread', value: threadUrl.slice(0, 1024) },
      { name: 'Member profile', value: profileUrl.slice(0, 1024) },
      { name: 'Reason', value: reason.slice(0, 1024) },
    )
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`attn:handle:${id}`)
      .setLabel('Handle')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`attn:rejected:${id}`)
      .setLabel('Rejected')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`attn:dismiss:${id}`)
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary),
  );

  let msg;
  try {
    msg = await channel.send({ embeds: [embed], components: [row] });
  } catch (e) {
    client.logger.error('attention: failed to post queue message', e);
    return interaction.editReply({
      content:
        'Could not post to the attention channel. Check that the bot can send messages and embeds there.',
    });
  }

  await client.db.setAttentionRequestQueueMessage(id, msg.id, channel.id);

  return interaction.editReply({ content: `Posted to ${channel}.` });
}

module.exports = { handleAttentionModalSubmit };
