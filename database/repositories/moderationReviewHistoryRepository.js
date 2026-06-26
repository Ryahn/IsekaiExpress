const db = require('../knex');

const HISTORY_TABLE = 'moderation_review_history';
const DEFAULT_HISTORY_LIMIT = 25;
const MAX_HISTORY_LIMIT = 100;

async function hasHistoryTable() {
  return db.schema.hasTable(HISTORY_TABLE);
}

async function hasColumn(tableName, columnName) {
  const exists = await db.schema.hasTable(tableName);
  return exists ? db.schema.hasColumn(tableName, columnName) : false;
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

function compactHistoryRow(row) {
  return {
    ...row,
    metadata: decodeMetadata(row.metadata_json),
  };
}

function normalizeFilters(filters = {}) {
  return {
    page: Math.max(1, parseInt(filters.page || 1, 10) || 1),
    limit: Math.min(
      MAX_HISTORY_LIMIT,
      Math.max(1, parseInt(filters.limit || DEFAULT_HISTORY_LIMIT, 10) || DEFAULT_HISTORY_LIMIT),
    ),
    eventType: cleanString(filters.eventType || filters.event_type, 48),
    subjectType: cleanString(filters.subjectType || filters.subject_type, 48),
    status: cleanString(filters.status, 32),
    action: cleanString(filters.action, 64),
    handledState:
      filters.handledState === 'handled' || filters.handled_state === 'handled'
        ? 'handled'
        : filters.handledState === 'pending' || filters.handled_state === 'pending'
          ? 'pending'
          : null,
    userId: cleanString(filters.userId || filters.user_id, 32),
    channelId: cleanString(filters.channelId || filters.channel_id, 32),
    from: filters.from || null,
    to: filters.to || null,
  };
}

function applyFilters(query, filters = {}) {
  const f = normalizeFilters(filters);
  if (f.eventType) query.where({ event_type: f.eventType });
  if (f.subjectType) query.where({ subject_type: f.subjectType });
  if (f.status) query.where({ status: f.status });
  if (f.action) query.where({ action: f.action });
  if (f.userId) query.where((builder) => builder.where({ author_id: f.userId }).orWhere({ subject_id: f.userId }));
  if (f.channelId) query.where({ channel_id: f.channelId });
  if (f.handledState === 'handled') query.whereNotNull('handled_at');
  if (f.handledState === 'pending') query.whereNull('handled_at');
  if (f.from) query.where('created_at', '>=', f.from);
  if (f.to) query.where('created_at', '<=', f.to);
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

module.exports = {
  createModerationReviewHistory: async (entry) => {
    if (!(await hasHistoryTable())) return null;

    const row = {
      guild_id: cleanString(entry.guildId || entry.guild_id, 32),
      event_type: cleanString(entry.eventType || entry.event_type, 48),
      subject_type: cleanString(entry.subjectType || entry.subject_type, 48),
      subject_id: cleanString(entry.subjectId || entry.subject_id, 128),
      author_id: cleanString(entry.authorId || entry.author_id, 32),
      channel_id: cleanString(entry.channelId || entry.channel_id, 32),
      source_message_id: cleanString(entry.sourceMessageId || entry.source_message_id, 32),
      queue_message_id: cleanString(entry.queueMessageId || entry.queue_message_id, 32),
      status: cleanString(entry.status, 32) || 'pending',
      action: cleanString(entry.action, 64),
      handled_by: cleanString(entry.handledBy || entry.handled_by, 32),
      handled_at: entry.handledAt || entry.handled_at || null,
      summary: cleanString(entry.summary, 500),
      metadata_json: encodeMetadata(entry.metadata || entry.metadata_json),
      created_at: db.fn.now(),
    };

    if (!row.guild_id || !row.event_type || !row.subject_type) return null;
    return insertAndReturnId(HISTORY_TABLE, row);
  },

  updateModerationReviewHistoryQueueMessage: async (id, queueMessageId) => {
    if (!id || !(await hasHistoryTable())) return 0;
    return db(HISTORY_TABLE)
      .where({ id })
      .update({ queue_message_id: cleanString(queueMessageId, 32) });
  },

  finalizeModerationReviewHistory: async (id, update = {}) => {
    if (!id || !(await hasHistoryTable())) return 0;
    const existing = await db(HISTORY_TABLE).select('metadata_json').where({ id }).first();
    const patch = {
      status: cleanString(update.status, 32) || 'handled',
      action: cleanString(update.action, 64),
      handled_by: cleanString(update.handledBy || update.handled_by, 32),
      handled_at: update.handledAt || update.handled_at || db.fn.now(),
    };
    const summary = cleanString(update.summary, 500);
    if (summary) patch.summary = summary;
    const existingMetadata = decodeMetadata(existing?.metadata_json);
    const updateMetadata = update.metadata || update.metadata_json || null;
    const metadata = encodeMetadata(updateMetadata ? { ...existingMetadata, ...updateMetadata } : existingMetadata);
    if (metadata) patch.metadata_json = metadata;
    return db(HISTORY_TABLE).where({ id }).update(patch);
  },

  setPendingInviteModerationHistoryId: async (id, moderationHistoryId) => {
    if (!id || !moderationHistoryId || !(await hasColumn('pending_invites', 'moderation_history_id'))) return 0;
    return db('pending_invites').where({ id }).update({ moderation_history_id: moderationHistoryId });
  },

  setPendingImageReviewModerationHistoryId: async (id, moderationHistoryId) => {
    if (!id || !moderationHistoryId || !(await hasColumn('pending_image_reviews', 'moderation_history_id'))) return 0;
    return db('pending_image_reviews').where({ id }).update({ moderation_history_id: moderationHistoryId });
  },

  setAttentionRequestModerationHistoryId: async (id, moderationHistoryId) => {
    if (!id || !moderationHistoryId || !(await hasColumn('attention_requests', 'moderation_history_id'))) return 0;
    return db('attention_requests').where({ id }).update({ moderation_history_id: moderationHistoryId });
  },

  getModerationReviewHistoryPage: async (filters = {}) => {
    if (!(await hasHistoryTable())) return { page: 1, limit: DEFAULT_HISTORY_LIMIT, rows: [], hasMore: false };
    const f = normalizeFilters(filters);
    const rows = await applyFilters(db(HISTORY_TABLE).select('*'), f)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(f.limit + 1)
      .offset((f.page - 1) * f.limit);
    return {
      page: f.page,
      limit: f.limit,
      rows: rows.slice(0, f.limit).map(compactHistoryRow),
      hasMore: rows.length > f.limit,
    };
  },

  getModerationReviewHistoryMetrics: async (filters = {}) => {
    if (!(await hasHistoryTable())) {
      return { total: 0, byEventType: {}, bySubjectType: {}, byStatus: {}, byAction: {}, pending: 0, handled: 0 };
    }
    const rows = await applyFilters(db(HISTORY_TABLE).select('*'), filters).orderBy('created_at', 'desc');
    const increment = (map, key) => {
      const label = key || 'unknown';
      map[label] = (map[label] || 0) + 1;
    };
    const byEventType = {};
    const bySubjectType = {};
    const byStatus = {};
    const byAction = {};
    for (const row of rows) {
      increment(byEventType, row.event_type);
      increment(bySubjectType, row.subject_type);
      increment(byStatus, row.status);
      increment(byAction, row.action);
    }
    return {
      total: rows.length,
      byEventType,
      bySubjectType,
      byStatus,
      byAction,
      pending: rows.filter((row) => !row.handled_at).length,
      handled: rows.filter((row) => row.handled_at).length,
    };
  },
};
