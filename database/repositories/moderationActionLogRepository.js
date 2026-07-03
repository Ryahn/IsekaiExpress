const db = require('../knex');

const LOG_TABLE = 'moderation_action_logs';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEDUP_WINDOW_MS = 10_000;

const VALID_ACTION_TYPES = new Set([
  'ban',
  'unban',
  'kick',
  'timeout',
  'timeout_remove',
  'caged',
  'uncaged',
  'uncaged_expired',
]);

const VALID_SOURCES = new Set(['bot_auto', 'bot_command', 'discord_audit', 'scheduled']);

async function hasLogTable() {
  return db.schema.hasTable(LOG_TABLE);
}

function cleanString(value, maxLength) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function encodeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  try {
    return JSON.stringify(metadata).slice(0, 65535);
  } catch (_) {
    return null;
  }
}

function decodeMetadata(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function compactLogRow(row) {
  return {
    ...row,
    metadata: decodeMetadata(row.metadata_json),
  };
}

function normalizeFilters(filters = {}) {
  return {
    page: Math.max(1, parseInt(filters.page || 1, 10) || 1),
    limit: Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(filters.limit || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT),
    ),
    actionType: cleanString(filters.actionType || filters.action_type, 32),
    targetUserId: cleanString(filters.targetUserId || filters.target_user_id, 32),
    moderatorUserId: cleanString(filters.moderatorUserId || filters.moderator_user_id, 32),
    search: cleanString(filters.search || filters.q, 200),
    from: filters.from || null,
    to: filters.to || null,
  };
}

function applyFilters(query, filters = {}) {
  const f = normalizeFilters(filters);
  if (f.actionType) query.where({ action_type: f.actionType });
  if (f.targetUserId) query.where({ target_user_id: f.targetUserId });
  if (f.moderatorUserId) query.where({ moderator_user_id: f.moderatorUserId });
  if (f.from) query.where('created_at', '>=', f.from);
  if (f.to) query.where('created_at', '<=', f.to);
  if (f.search) {
    const term = `%${f.search.toLowerCase()}%`;
    query.where((builder) => {
      builder
        .whereRaw('LOWER(deleted_content) LIKE ?', [term])
        .orWhereRaw('LOWER(reason) LIKE ?', [term])
        .orWhereRaw('LOWER(target_username) LIKE ?', [term])
        .orWhereRaw('LOWER(target_display_name) LIKE ?', [term]);
    });
  }
  return query;
}

async function insertAndReturnId(tableName, row) {
  const res = await db(tableName).insert(row);
  const id = Array.isArray(res) ? res[0] : res;
  if (id != null) return Number(id);
  const r = await db.raw('SELECT LAST_INSERT_ID() AS id');
  const row0 = r && r[0];
  return Number((Array.isArray(row0) ? row0[0] : row0)?.id);
}

function buildRow(entry) {
  const actionType = cleanString(entry.actionType || entry.action_type, 32);
  const source = cleanString(entry.source, 32) || 'discord_audit';
  if (!actionType || !VALID_ACTION_TYPES.has(actionType)) return null;
  if (!VALID_SOURCES.has(source)) return null;

  return {
    guild_id: cleanString(entry.guildId || entry.guild_id, 32),
    action_type: actionType,
    target_user_id: cleanString(entry.targetUserId || entry.target_user_id, 32),
    target_username: cleanString(entry.targetUsername || entry.target_username, 128),
    target_display_name: cleanString(entry.targetDisplayName || entry.target_display_name, 128),
    moderator_user_id: cleanString(entry.moderatorUserId || entry.moderator_user_id, 32),
    moderator_username: cleanString(entry.moderatorUsername || entry.moderator_username, 128),
    moderator_display_name: cleanString(entry.moderatorDisplayName || entry.moderator_display_name, 128),
    channel_id: cleanString(entry.channelId || entry.channel_id, 32),
    source_message_id: cleanString(entry.sourceMessageId || entry.source_message_id, 32),
    deleted_content: entry.deletedContent != null || entry.deleted_content != null
      ? String(entry.deletedContent ?? entry.deleted_content).slice(0, 65535)
      : null,
    reason: entry.reason != null ? String(entry.reason).slice(0, 65535) : null,
    audit_log_entry_id: cleanString(entry.auditLogEntryId || entry.audit_log_entry_id, 32),
    source,
    metadata_json: encodeMetadata(entry.metadata || entry.metadata_json),
    created_at: entry.createdAt || entry.created_at || db.fn.now(),
  };
}

module.exports = {
  VALID_ACTION_TYPES,
  VALID_SOURCES,
  DEDUP_WINDOW_MS,

  createModerationActionLog: async (entry) => {
    if (!(await hasLogTable())) return null;
    const row = buildRow(entry);
    if (!row?.guild_id || !row.target_user_id) return null;
    return insertAndReturnId(LOG_TABLE, row);
  },

  updateModerationActionLogAuditId: async (id, auditLogEntryId) => {
    if (!id || !(await hasLogTable())) return 0;
    return db(LOG_TABLE)
      .where({ id })
      .whereNull('audit_log_entry_id')
      .update({ audit_log_entry_id: cleanString(auditLogEntryId, 32) });
  },

  findRecentModerationActionDuplicate: async (guildId, targetUserId, actionType, withinMs = DEDUP_WINDOW_MS) => {
    if (!(await hasLogTable())) return null;
    const since = new Date(Date.now() - withinMs);
    const row = await db(LOG_TABLE)
      .select('*')
      .where({
        guild_id: cleanString(guildId, 32),
        target_user_id: cleanString(targetUserId, 32),
        action_type: cleanString(actionType, 32),
      })
      .whereNull('audit_log_entry_id')
      .where('created_at', '>=', since)
      .orderBy('created_at', 'desc')
      .first();
    return row ? compactLogRow(row) : null;
  },

  getModerationActionLogByAuditEntryId: async (auditLogEntryId) => {
    if (!(await hasLogTable())) return null;
    const id = cleanString(auditLogEntryId, 32);
    if (!id) return null;
    const row = await db(LOG_TABLE).where({ audit_log_entry_id: id }).first();
    return row ? compactLogRow(row) : null;
  },

  getModerationActionLogsPage: async (filters = {}) => {
    if (!(await hasLogTable())) {
      return { page: 1, limit: DEFAULT_LIMIT, rows: [], hasMore: false };
    }
    const f = normalizeFilters(filters);
    const rows = await applyFilters(db(LOG_TABLE).select('*'), f)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(f.limit + 1)
      .offset((f.page - 1) * f.limit);
    return {
      page: f.page,
      limit: f.limit,
      rows: rows.slice(0, f.limit).map(compactLogRow),
      hasMore: rows.length > f.limit,
    };
  },

  getModerationActionLogMetrics: async (filters = {}) => {
    if (!(await hasLogTable())) {
      return { total: 0, byActionType: {} };
    }
    const rows = await applyFilters(db(LOG_TABLE).select('action_type'), filters);
    const byActionType = {};
    for (const row of rows) {
      const key = row.action_type || 'unknown';
      byActionType[key] = (byActionType[key] || 0) + 1;
    }
    return { total: rows.length, byActionType };
  },
};
