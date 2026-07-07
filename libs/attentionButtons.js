const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');
const { archiveAttentionRequestMessage, getAttentionArchiveChannels } = require('./attentionArchive');

async function denyButton(interaction, text) {
  try {
    await interaction.deferUpdate();
  } catch (_) {
    /* ignore */
  }
  try {
    await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
  } catch (_) {
    /* ignore */
  }
}

function canResolveModLane(member, modRoleId) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const id = typeof modRoleId === 'string' ? modRoleId.trim() : '';
  return Boolean(id && member.roles.cache.has(id));
}

function canResolveStaffLane(member, staffRoleId) {
  return hasGuildAdminOrStaffRole(member, staffRoleId);
}

function actionToStatus(action) {
  if (action === 'handle') return 'handled';
  if (action === 'rejected') return 'rejected';
  if (action === 'dismiss') return 'dismissed';
  return null;
}

function statusPingWord(status) {
  if (status === 'handled') return 'Handled';
  if (status === 'rejected') return 'Rejected';
  if (status === 'dismissed') return 'Dismissed';
  return 'Updated';
}

async function finalizeAttentionHistory(client, row, status, interaction) {
  let historyId = row.moderation_history_id;
  if (!historyId && typeof client.db.createModerationReviewHistory === 'function') {
    historyId = await client.db.createModerationReviewHistory({
      guildId: row.guild_id,
      eventType: 'attention_request',
      subjectType: 'user',
      subjectId: row.author_id,
      authorId: row.author_id,
      channelId: row.source_channel_id || row.queue_channel_id || interaction.channelId,
      queueMessageId: row.queue_message_id,
      status: 'handled',
      action: status,
      handledBy: interaction.user.id,
      handledAt: new Date(),
      summary: `Attention request ${status} by ${interaction.user.tag}`,
      metadata: {
        attentionRequestId: row.id,
        lane: row.lane,
        requestType: row.request_type || null,
      },
    });
  }
  if (historyId && typeof client.db.finalizeModerationReviewHistory === 'function') {
    await client.db.finalizeModerationReviewHistory(historyId, {
      status: 'handled',
      action: status,
      handledBy: interaction.user.id,
      summary: `Attention request ${status} by ${interaction.user.tag}`,
      metadata: {
        attentionRequestId: row.id,
        lane: row.lane,
        requestType: row.request_type || null,
      },
    });
  }
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if this was an attention button and was consumed
 */
async function handleAttentionButton(client, interaction) {
  if (!interaction.isButton() || !interaction.customId?.startsWith('attn:')) return false;
  const parts = interaction.customId.split(':');
  if (parts.length !== 3 || parts[0] !== 'attn') return false;
  const action = parts[1];
  const id = parseInt(parts[2], 10);
  const status = actionToStatus(action);
  if (!status || !id) return false;

  const row = await client.db.getAttentionRequestById(id);
  if (!row || row.guild_id !== interaction.guildId) {
    await denyButton(interaction, 'This attention request is invalid or belongs to another server.');
    return true;
  }

  const modRoleId = client.config?.roles?.mod;
  const staffRoleId = client.config?.roles?.staff;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (row.lane === 'mod') {
    if (!canResolveModLane(member, modRoleId)) {
      return denyButton(interaction, 'You do not have permission to resolve mod-queue attention requests.');
    }
  } else if (row.lane === 'staff') {
    if (!canResolveStaffLane(member, staffRoleId)) {
      return denyButton(interaction, 'You do not have permission to resolve staff-queue attention requests.');
    }
  } else {
    return denyButton(interaction, 'Unknown queue type.');
  }

  const affected = await client.db.claimAttentionRequestStatus(id, status, interaction.user.id);
  if (affected !== 1) {
    await interaction.deferUpdate().catch(() => {});
    await interaction.followUp({ content: 'This request was already resolved.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }

  try {
    await interaction.deferUpdate();
  } catch (_) {
    /* ignore */
  }

  const queueChannelId = row.queue_channel_id || interaction.channelId;
  const queueChannel =
    interaction.guild.channels.cache.get(queueChannelId) ||
    (await interaction.guild.channels.fetch(queueChannelId).catch(() => null));

  const pingChannelIdRaw =
    row.source_channel_id != null && String(row.source_channel_id).trim() !== ''
      ? String(row.source_channel_id).trim()
      : queueChannelId;
  const pingChannel =
    interaction.guild.channels.cache.get(pingChannelIdRaw) ||
    (await interaction.guild.channels.fetch(pingChannelIdRaw).catch(() => null));

  const word = statusPingWord(status);
  const laneLabel = row.lane === 'mod' ? 'mod' : 'staff';
  const pingContent = `<@${row.author_id}> Your attention request (**${laneLabel}** queue) was **${word}** by ${interaction.user}.`;

  if (pingChannel && pingChannel.isTextBased()) {
    await pingChannel.send({ content: pingContent }).catch((e) =>
      client.logger.warn(`attention: ping author in source channel failed: ${e?.message || e}`),
    );
  } else {
    client.logger.warn(
      `attention: could not resolve ping channel ${pingChannelIdRaw} for request ${id}; author may not be notified.`,
    );
  }

  await finalizeAttentionHistory(client, row, status, interaction);

  const archiveChannels = await getAttentionArchiveChannels(client, interaction.guild).catch((e) => {
    client.logger.warn(`attention: could not load archive config for request ${id}: ${e?.message || e}`);
    return null;
  });
  if (archiveChannels?.archiveChannel) {
    const updatedRow = await client.db.getAttentionRequestById(id);
    const result = await archiveAttentionRequestMessage(client, interaction.guild, updatedRow, {
      queueChannel,
      archiveChannel: archiveChannels.archiveChannel,
    }).catch((e) => ({ status: 'failed', reason: e?.message || String(e) }));
    if (result.status !== 'archived' && result.status !== 'skipped') {
      client.logger.warn(`attention: archive request ${id} failed: ${result.reason || result.status}`);
    }
  }

  return true;
}

module.exports = { handleAttentionButton };
