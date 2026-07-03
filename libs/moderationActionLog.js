const { AuditLogEvent } = require('discord-api-types/v10');
const { DEDUP_WINDOW_MS } = require('../database/repositories/moderationActionLogRepository');

const DELETED_CONTENT_MAX = 2000;

function cleanText(value, maxLength = DELETED_CONTENT_MAX) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function memberDisplayName(member) {
  if (!member) return null;
  return member.nickname || member.displayName || member.user?.globalName || member.user?.username || null;
}

function userUsername(user) {
  if (!user) return null;
  return user.globalName || user.username || user.tag || null;
}

async function resolveMember(guild, userId) {
  if (!guild || !userId) return null;
  return guild.members.fetch(userId).catch(() => null);
}

async function resolveUser(client, userId) {
  if (!client || !userId) return null;
  return client.users.fetch(userId).catch(() => null);
}

function buildDeletedContentFromMessage(message) {
  if (!message) return null;
  const parts = [];
  const content = cleanText(message.content, DELETED_CONTENT_MAX);
  if (content) parts.push(content);

  const attachments = message.attachments?.size
    ? [...message.attachments.values()]
    : Array.isArray(message.attachments)
      ? message.attachments
      : [];

  for (const attachment of attachments) {
    const name = attachment.name || attachment.filename || 'attachment';
    const url = attachment.url || attachment.proxyURL || '';
    parts.push(url ? `[${name}] ${url}` : `[${name}]`);
  }

  if (!parts.length) return null;
  return parts.join('\n').slice(0, DELETED_CONTENT_MAX);
}

function mapAuditActionToType(entry) {
  switch (entry.action) {
    case AuditLogEvent.MemberBanAdd:
      return 'ban';
    case AuditLogEvent.MemberBanRemove:
      return 'unban';
    case AuditLogEvent.MemberKick:
      return 'kick';
    case AuditLogEvent.MemberUpdate: {
      const timeoutChange = entry.changes?.find((change) => change.key === 'communication_disabled_until');
      if (!timeoutChange) return null;
      const hadTimeout = timeoutChange.old != null && timeoutChange.old !== '';
      const hasTimeout = timeoutChange.new != null && timeoutChange.new !== '';
      if (!hadTimeout && hasTimeout) return 'timeout';
      if (hadTimeout && !hasTimeout) return 'timeout_remove';
      if (hadTimeout && hasTimeout) return 'timeout';
      return null;
    }
    default:
      return null;
  }
}

function extractTimeoutMetadata(entry) {
  const timeoutChange = entry.changes?.find((change) => change.key === 'communication_disabled_until');
  if (!timeoutChange) return {};
  return {
    timeoutUntil: timeoutChange.new || null,
    previousTimeoutUntil: timeoutChange.old || null,
  };
}

function extractChannelIdFromAudit(entry) {
  const channel = entry.extra?.channel;
  if (channel?.id) return String(channel.id);
  if (entry.extra?.messageId && channel?.id) return String(channel.id);
  return null;
}

async function enrichFromAuditEntry(guild, entry) {
  const actionType = mapAuditActionToType(entry);
  if (!actionType) return null;

  const targetUserId = entry.targetId ? String(entry.targetId) : null;
  if (!targetUserId) return null;

  const [targetMember, targetUser, executorMember, executorUser] = await Promise.all([
    resolveMember(guild, targetUserId),
    resolveUser(guild?.client, targetUserId),
    entry.executorId ? resolveMember(guild, entry.executorId) : Promise.resolve(null),
    entry.executorId ? resolveUser(guild?.client, entry.executorId) : Promise.resolve(null),
  ]);

  const metadata = {
    auditAction: entry.action,
    ...extractTimeoutMetadata(entry),
  };

  if (entry.extra?.count != null) metadata.deleteCount = entry.extra.count;
  if (entry.extra?.messageId) metadata.messageId = String(entry.extra.messageId);

  return {
    guildId: guild.id,
    actionType,
    targetUserId,
    targetUsername: userUsername(targetUser) || userUsername(targetMember?.user),
    targetDisplayName: memberDisplayName(targetMember) || userUsername(targetUser),
    moderatorUserId: entry.executorId ? String(entry.executorId) : null,
    moderatorUsername: userUsername(executorUser) || userUsername(executorMember?.user),
    moderatorDisplayName: memberDisplayName(executorMember) || userUsername(executorUser),
    channelId: extractChannelIdFromAudit(entry),
    sourceMessageId: entry.extra?.messageId ? String(entry.extra.messageId) : null,
    deletedContent: null,
    reason: cleanText(entry.reason, 65535),
    auditLogEntryId: entry.id ? String(entry.id) : null,
    source: 'discord_audit',
    metadata,
  };
}

async function tryCorrelateDeletedContent(guild, entry, enriched) {
  if (enriched.deletedContent || !guild || !entry.executorId) return enriched;

  try {
    const logs = await guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.MessageDelete,
    });
    const now = Date.now();
    const correlated = logs.entries.find((auditEntry) => {
      if (!auditEntry.executorId || String(auditEntry.executorId) !== String(entry.executorId)) return false;
      const age = now - auditEntry.createdTimestamp;
      if (age > 15_000) return false;
      const targetMatches = auditEntry.targetId && String(auditEntry.targetId) === enriched.targetUserId;
      const channelMatches = enriched.channelId
        ? extractChannelIdFromAudit(auditEntry) === enriched.channelId
        : true;
      return targetMatches && channelMatches;
    });

    if (!correlated) return enriched;

    const content = correlated.extra?.content || correlated.changes?.find((c) => c.key === 'content')?.old;
    return {
      ...enriched,
      deletedContent: cleanText(content, DELETED_CONTENT_MAX),
      channelId: enriched.channelId || extractChannelIdFromAudit(correlated),
      sourceMessageId: enriched.sourceMessageId || correlated.extra?.messageId || null,
      metadata: {
        ...enriched.metadata,
        correlatedMessageDeleteAuditId: correlated.id ? String(correlated.id) : null,
      },
    };
  } catch (_) {
    return enriched;
  }
}

async function recordModerationAction(client, params) {
  if (!client?.db?.createModerationActionLog) return null;

  const guildId = params.guildId || params.guild_id;
  const actionType = params.actionType || params.action_type;
  const targetUserId = params.targetUserId || params.target_user_id;
  if (!guildId || !actionType || !targetUserId) return null;

  const auditLogEntryId = params.auditLogEntryId || params.audit_log_entry_id || null;
  if (auditLogEntryId && typeof client.db.getModerationActionLogByAuditEntryId === 'function') {
    const existing = await client.db.getModerationActionLogByAuditEntryId(auditLogEntryId);
    if (existing) return existing.id;
  }

  if (auditLogEntryId && typeof client.db.findRecentModerationActionDuplicate === 'function') {
    const duplicate = await client.db.findRecentModerationActionDuplicate(
      guildId,
      targetUserId,
      actionType,
      params.dedupWindowMs || DEDUP_WINDOW_MS,
    );
    if (duplicate) {
      await client.db.updateModerationActionLogAuditId(duplicate.id, auditLogEntryId);
      return duplicate.id;
    }
  }

  const guild = params.guild
    || client.guilds?.cache?.get(guildId)
    || (client.guilds?.fetch ? await client.guilds.fetch(guildId).catch(() => null) : null);

  let targetUsername = params.targetUsername || params.target_username || null;
  let targetDisplayName = params.targetDisplayName || params.target_display_name || null;
  let moderatorUsername = params.moderatorUsername || params.moderator_username || null;
  let moderatorDisplayName = params.moderatorDisplayName || params.moderator_display_name || null;

  const moderatorUserId = params.moderatorUserId || params.moderator_user_id || null;

  if (guild && (!targetUsername || !targetDisplayName)) {
    const targetMember = await resolveMember(guild, targetUserId);
    const targetUser = targetMember?.user || await resolveUser(client, targetUserId);
    targetUsername = targetUsername || userUsername(targetUser);
    targetDisplayName = targetDisplayName || memberDisplayName(targetMember) || userUsername(targetUser);
  }

  if (guild && moderatorUserId && (!moderatorUsername || !moderatorDisplayName)) {
    const modMember = await resolveMember(guild, moderatorUserId);
    const modUser = modMember?.user || await resolveUser(client, moderatorUserId);
    moderatorUsername = moderatorUsername || userUsername(modUser);
    moderatorDisplayName = moderatorDisplayName || memberDisplayName(modMember) || userUsername(modUser);
  }

  if (!moderatorUsername && params.moderatorUser) {
    moderatorUsername = userUsername(params.moderatorUser);
    moderatorDisplayName = moderatorDisplayName || memberDisplayName(params.moderatorMember) || moderatorUsername;
  }

  if (!targetUsername && params.targetUser) {
    targetUsername = userUsername(params.targetUser);
    targetDisplayName = targetDisplayName || memberDisplayName(params.targetMember) || targetUsername;
  }

  const message = params.message || null;
  const deletedContent = params.deletedContent
    ?? params.deleted_content
    ?? buildDeletedContentFromMessage(message);

  return client.db.createModerationActionLog({
    guildId,
    actionType,
    targetUserId,
    targetUsername,
    targetDisplayName,
    moderatorUserId,
    moderatorUsername,
    moderatorDisplayName,
    channelId: params.channelId || params.channel_id || message?.channelId || null,
    sourceMessageId: params.sourceMessageId || params.source_message_id || message?.id || null,
    deletedContent,
    reason: params.reason != null ? String(params.reason).slice(0, 65535) : null,
    auditLogEntryId,
    source: params.source || 'bot_command',
    metadata: params.metadata || null,
  });
}

async function recordFromAuditLog(client, auditEntry) {
  const guild = auditEntry.guild;
  if (!guild) return null;

  let enriched = await enrichFromAuditEntry(guild, auditEntry);
  if (!enriched) return null;

  enriched = await tryCorrelateDeletedContent(guild, auditEntry, enriched);
  return recordModerationAction(client, enriched);
}

module.exports = {
  DELETED_CONTENT_MAX,
  buildDeletedContentFromMessage,
  mapAuditActionToType,
  enrichFromAuditEntry,
  recordModerationAction,
  recordFromAuditLog,
  memberDisplayName,
  userUsername,
};
