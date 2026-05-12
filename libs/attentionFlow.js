const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');

const MAX_URL = 2000;
const MAX_TEXT = 4000;

/** @type {Record<string, string>} */
const REQUEST_TYPE_LABELS = {
  ownership_transfer: 'Ownership transfer',
  remove_ownership: 'Remove ownership',
  alt_check: 'Alt check',
  something_else: 'Something else',
  legacy_form: 'Legacy (old form)',
};

const SELECT_VALUES = [
  { label: 'Ownership transfer', description: 'Thread URL + ticket URL', value: 'ownership_transfer|0' },
  {
    label: 'Ownership transfer + optional notes',
    description: 'Thread, ticket, extra text field',
    value: 'ownership_transfer|1',
  },
  { label: 'Remove ownership', description: 'Thread URL only', value: 'remove_ownership|0' },
  {
    label: 'Remove ownership + optional notes',
    description: 'Thread URL + extra text field',
    value: 'remove_ownership|1',
  },
  { label: 'Alt check', description: 'Member URL + optional details', value: 'alt_check|0' },
  {
    label: 'Alt check + optional notes',
    description: 'Member URL, details, extra field',
    value: 'alt_check|1',
  },
  { label: 'Something else', description: 'Describe in one text box', value: 'something_else|0' },
  {
    label: 'Something else + optional notes',
    description: 'Main text + extra field',
    value: 'something_else|1',
  },
];

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
 * @param {'mod'|'staff'} lane
 */
function buildAttentionTypeSelectRows(lane) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`attention:typepick:${lane}`)
    .setPlaceholder('Choose request type…')
    .addOptions(
      SELECT_VALUES.map((o) => ({
        label: o.label.slice(0, 100),
        description: o.description ? o.description.slice(0, 100) : undefined,
        value: o.value,
      })),
    );
  return [new ActionRowBuilder().addComponents(select)];
}

/**
 * @returns {{ lane: 'mod'|'staff', requestType: string, includeExtra: boolean } | null}
 */
function parseModalCustomId(customId) {
  const parts = String(customId || '').split(':');
  if (parts.length !== 5 || parts[0] !== 'attention' || parts[1] !== 'form') return null;
  const lane = parts[2];
  if (lane !== 'mod' && lane !== 'staff') return null;
  const requestType = parts[3];
  const extra = parts[4];
  if (extra !== '0' && extra !== '1') return null;
  return { lane, requestType, includeExtra: extra === '1' };
}

function optionalExtraField(includeExtra) {
  if (!includeExtra) return null;
  return new TextInputBuilder()
    .setCustomId('attention_extra')
    .setLabel('Additional details (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(0)
    .setMaxLength(MAX_TEXT)
    .setRequired(false);
}

/**
 * @param {'mod'|'staff'} lane
 * @param {string} requestType
 * @param {boolean} includeExtra
 */
function buildAttentionModal(lane, requestType, includeExtra) {
  const titleBase = lane === 'mod' ? 'Attention (mod)' : 'Attention (staff)';
  const typeLabel = REQUEST_TYPE_LABELS[requestType] || requestType;
  const modal = new ModalBuilder()
    .setCustomId(`attention:form:${lane}:${requestType}:${includeExtra ? '1' : '0'}`)
    .setTitle(`${titleBase}: ${typeLabel}`.slice(0, 45));

  const rows = [];

  if (requestType === 'ownership_transfer') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('attention_thread')
          .setLabel('Thread URL')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(4)
          .setMaxLength(MAX_URL)
          .setRequired(true),
      ),
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('attention_ticket')
          .setLabel('Ticket URL')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(4)
          .setMaxLength(MAX_URL)
          .setRequired(true),
      ),
    );
  } else if (requestType === 'remove_ownership') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('attention_thread')
          .setLabel('Thread URL')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(4)
          .setMaxLength(MAX_URL)
          .setRequired(true),
      ),
    );
  } else if (requestType === 'alt_check') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('attention_member')
          .setLabel('Member profile URL')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(4)
          .setMaxLength(MAX_URL)
          .setRequired(true),
      ),
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('attention_optional')
          .setLabel('Details (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(0)
          .setMaxLength(MAX_TEXT)
          .setRequired(false),
      ),
    );
  } else if (requestType === 'something_else') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('attention_main')
          .setLabel('Describe your request')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(MAX_TEXT)
          .setRequired(true),
      ),
    );
  } else {
    return null;
  }

  const extra = optionalExtraField(includeExtra);
  if (extra) {
    rows.push(new ActionRowBuilder().addComponents(extra));
  }

  if (rows.length > 5) {
    return null;
  }

  modal.addComponents(...rows);
  return modal;
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleAttentionTypeSelect(client, interaction) {
  const id = interaction.customId || '';
  const m = /^attention:typepick:(mod|staff)$/.exec(id);
  if (!m) return false;

  const lane = m[1];
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Use this in a server.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (lane === 'mod' && !canSubmitModLane(member, client)) {
    await interaction.reply({
      content: 'You need the mod role, uploader role, or Administrator for the mod queue.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (lane === 'staff' && !canSubmitStaffLane(member, client)) {
    await interaction.reply({
      content: 'You need the staff role or Administrator for the staff queue.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const raw = interaction.values[0] || '';
  const [requestType, extraBit] = raw.split('|');
  const includeExtra = extraBit === '1';
  const allowed = ['ownership_transfer', 'remove_ownership', 'alt_check', 'something_else'];
  if (!allowed.includes(requestType)) {
    await interaction.reply({ content: 'Invalid selection.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }

  const modal = buildAttentionModal(lane, requestType, includeExtra);
  if (!modal) {
    await interaction
      .reply({ content: 'Could not build form for that type.', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  try {
    await interaction.showModal(modal);
  } catch (e) {
    client.logger.error('attention: showModal failed', e);
    await interaction
      .reply({ content: 'Could not open the form. Try the command again.', flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }
  return true;
}

function fieldOrEmpty(interaction, id) {
  try {
    return truncate(interaction.fields.getTextInputValue(id), MAX_TEXT);
  } catch {
    return '';
  }
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleAttentionModalSubmit(client, interaction) {
  const parsed = parseModalCustomId(interaction.customId);
  if (!parsed) {
    await interaction
      .reply({
        content: 'This form is outdated. Please run `/attention` again.',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }

  const { lane, requestType, includeExtra } = parsed;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
      content: 'You need the mod role, uploader role, or Administrator to use the mod queue.',
    });
  }
  if (lane === 'staff' && !canSubmitStaffLane(member, client)) {
    return interaction.editReply({
      content: 'You need the staff role or Administrator to use the staff queue.',
    });
  }

  let threadUrl = null;
  let ticketUrl = null;
  let profileUrl = null;
  let reason = null;
  let extraNotes = includeExtra ? fieldOrEmpty(interaction, 'attention_extra') : null;
  if (extraNotes === '') extraNotes = null;

  if (requestType === 'ownership_transfer') {
    threadUrl = fieldOrEmpty(interaction, 'attention_thread') || null;
    ticketUrl = fieldOrEmpty(interaction, 'attention_ticket') || null;
    if (!threadUrl || !ticketUrl) {
      return interaction.editReply({ content: 'Thread URL and ticket URL are required.' });
    }
  } else if (requestType === 'remove_ownership') {
    threadUrl = fieldOrEmpty(interaction, 'attention_thread') || null;
    if (!threadUrl) {
      return interaction.editReply({ content: 'Thread URL is required.' });
    }
  } else if (requestType === 'alt_check') {
    profileUrl = fieldOrEmpty(interaction, 'attention_member') || null;
    const opt = fieldOrEmpty(interaction, 'attention_optional');
    reason = opt || null;
    if (!profileUrl) {
      return interaction.editReply({ content: 'Member profile URL is required.' });
    }
  } else if (requestType === 'something_else') {
    reason = fieldOrEmpty(interaction, 'attention_main') || null;
    if (!reason) {
      return interaction.editReply({ content: 'Please describe your request.' });
    }
  } else {
    return interaction.editReply({ content: 'Unknown request type.' });
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
    request_type: requestType,
    thread_url: threadUrl,
    ticket_url: ticketUrl,
    profile_url: profileUrl,
    reason,
    extra_notes: extraNotes,
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
  const typeLabel = REQUEST_TYPE_LABELS[requestType] || requestType;

  const embed = new EmbedBuilder()
    .setTitle('Attention request')
    .setColor(lane === 'mod' ? 0x5865f2 : 0xf0b232)
    .addFields(
      { name: 'Queue', value: `**${queueLabel}**`, inline: true },
      { name: 'Type', value: typeLabel, inline: true },
      { name: 'Submitted by', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setTimestamp(new Date());

  if (threadUrl) embed.addFields({ name: 'Thread', value: threadUrl.slice(0, 1024) });
  if (ticketUrl) embed.addFields({ name: 'Ticket', value: ticketUrl.slice(0, 1024) });
  if (profileUrl) embed.addFields({ name: 'Member profile', value: profileUrl.slice(0, 1024) });
  if (reason) embed.addFields({ name: 'Details', value: reason.slice(0, 1024) });
  if (extraNotes) embed.addFields({ name: 'Extra notes', value: extraNotes.slice(0, 1024) });

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

module.exports = {
  REQUEST_TYPE_LABELS,
  buildAttentionTypeSelectRows,
  buildAttentionModal,
  parseModalCustomId,
  handleAttentionTypeSelect,
  handleAttentionModalSubmit,
};
