const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const RESOLVED_ATTENTION_STATUSES = new Set(['handled', 'rejected', 'dismissed']);

function channelIdFromConfig(value) {
  return value != null ? String(value).trim() : '';
}

async function fetchGuildTextChannel(guild, channelId) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  return channel && channel.isTextBased() ? channel : null;
}

async function getAttentionArchiveChannels(client, guild) {
  const cfg = await client.db.getGuildConfigurable(guild.id);
  const queueChannelId = channelIdFromConfig(cfg?.attention_channel_id);
  const archiveChannelId = channelIdFromConfig(cfg?.attention_archive_channel_id);

  return {
    cfg,
    queueChannelId,
    archiveChannelId,
    queueChannel: await fetchGuildTextChannel(guild, queueChannelId),
    archiveChannel: await fetchGuildTextChannel(guild, archiveChannelId),
  };
}

function missingChannelReason({ queueChannelId, archiveChannelId, queueChannel, archiveChannel }) {
  if (!queueChannelId) return 'No attention queue channel is configured.';
  if (!archiveChannelId) return 'No attention archive channel is configured.';
  if (!queueChannel) return 'The configured attention queue channel is missing or is not text-based.';
  if (!archiveChannel) return 'The configured attention archive channel is missing or is not text-based.';
  return null;
}

function missingBotPermissions(channel, permissions) {
  const me = channel.guild.members.me;
  if (!me) return permissions;
  const channelPermissions = channel.permissionsFor(me);
  if (!channelPermissions) return permissions;
  return permissions.filter((permission) => !channelPermissions.has(permission));
}

function ensurePrunePermissions(queueChannel, archiveChannel) {
  const queueMissing = missingBotPermissions(queueChannel, [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages,
  ]);
  if (queueMissing.length) {
    return 'I need View Channel, Read Message History, and Manage Messages in the attention queue channel.';
  }

  const archiveMissing = missingBotPermissions(archiveChannel, [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]);
  if (archiveMissing.length) {
    return 'I need View Channel, Send Messages, and Embed Links in the attention archive channel.';
  }

  return null;
}

function archiveEmbedsFromMessage(message) {
  return message.embeds.map((embed) => EmbedBuilder.from(embed));
}

function resolvedAttentionStatusLabel(status) {
  if (status === 'handled') return 'Handled';
  if (status === 'rejected') return 'Rejected';
  return 'Dismissed';
}

function appendResolvedAttentionField(embed, row, options = {}) {
  const reviewedBy = options.resolvedBy || row?.reviewed_by;
  const resolvedAt = options.resolvedAt || row?.resolved_at;
  const status = row?.status;

  embed.addFields({
    name: 'Resolved',
    value: [
      status ? `**Status:** ${resolvedAttentionStatusLabel(status)}` : null,
      reviewedBy ? `**By:** <@${reviewedBy}>` : null,
      resolvedAt ? `**At:** <t:${Math.floor(new Date(resolvedAt).getTime() / 1000)}:f>` : null,
    ].filter(Boolean).join('\n'),
    inline: false,
  });
}

async function archiveAttentionRequestMessage(client, guild, row, options = {}) {
  if (!row || !RESOLVED_ATTENTION_STATUSES.has(row.status)) {
    return { status: 'skipped', reason: 'request is not resolved' };
  }
  if (row.archived_at) {
    return { status: 'skipped', reason: 'request is already archived' };
  }

  const archiveChannel =
    options.archiveChannel ||
    (await fetchGuildTextChannel(guild, channelIdFromConfig(options.archiveChannelId)));
  if (!archiveChannel) {
    return { status: 'failed', reason: 'archive channel is missing or not text-based' };
  }

  const queueChannelId = channelIdFromConfig(row.queue_channel_id || options.queueChannelId);
  const queueChannel =
    options.queueChannel || (await fetchGuildTextChannel(guild, queueChannelId));
  if (!queueChannel) {
    return { status: 'failed', reason: 'queue channel is missing or not text-based' };
  }
  if (!row.queue_message_id) {
    return { status: 'missing', reason: 'request has no queue message id' };
  }

  const message = await queueChannel.messages.fetch(row.queue_message_id).catch(() => null);
  if (!message) {
    return { status: 'missing', reason: 'queue message was not found' };
  }

  const embeds = archiveEmbedsFromMessage(message);
  if (!embeds.length) {
    return { status: 'failed', reason: 'queue message has no embeds to archive' };
  }

  const primaryEmbed = embeds[0];
  appendResolvedAttentionField(primaryEmbed, row, options);

  const archiveMessage = await archiveChannel.send({ embeds, components: [] });
  const marked = await client.db.markAttentionRequestArchived(row.id, archiveMessage.id, archiveChannel.id);
  if (marked !== 1) {
    await archiveMessage.delete().catch(() => {});
    return { status: 'skipped', reason: 'request was archived by another process' };
  }

  await message.delete().catch((e) => {
    client.logger.warn(
      `attention: archived request ${row.id} but could not delete queue message ${row.queue_message_id}: ${e?.message || e}`,
    );
  });

  return { status: 'archived', archiveMessageId: archiveMessage.id };
}

module.exports = {
  getAttentionArchiveChannels,
  missingChannelReason,
  ensurePrunePermissions,
  archiveAttentionRequestMessage,
};
