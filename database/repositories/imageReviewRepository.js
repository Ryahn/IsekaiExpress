const crypto = require('crypto');
const db = require('../knex');
const {
  normalizeScamScanText,
  exportScamScanRulesTextRows,
  parseScamScanRulesText,
  testScamScanRulesAgainstTextRows,
} = require('../../libs/scamScanRulesText');
const {
  SCAM_SCAN_SETTING_DEFINITIONS,
  SCAM_SCAN_SETTINGS_CACHE_MS,
  defaultScamScanSettings,
  hydrateScamScanSettingsRows,
  parseScamScanSettingsInput,
  serializeScamScanSettingValue,
} = require('../../libs/scamScanSettings');
const logger = require('../../libs/logger');

let scamScanSettingsCache = { t: 0, settings: null };
let scamScanSettingsInvalidRowsWarnedAt = 0;
const SCAM_SCAN_HISTORY_RETENTION_DAYS = 30;

async function hasScamScanRulesTable() {
  return db.schema.hasTable('scam_scan_rules');
}

async function hasScamScanSettingsTable() {
  return db.schema.hasTable('scam_scan_settings');
}

async function hasScamScanHistoryTable() {
  return db.schema.hasTable('scam_scan_history');
}

async function hasColumn(tableName, columnName) {
  const exists = await db.schema.hasTable(tableName);
  return exists ? db.schema.hasColumn(tableName, columnName) : false;
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function boolValue(value) {
  return value ? 1 : 0;
}

function hashAttachmentUrl(url) {
  if (!url) return null;
  return crypto.createHash('sha256').update(String(url)).digest('hex');
}

function encodeArray(values) {
  const cleaned = (values || [])
    .filter((value) => value != null && value !== '')
    .map((value) => String(value));
  return cleaned.length ? JSON.stringify(cleaned) : null;
}

function decodeArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function compactScanHistoryRow(row) {
  return {
    ...row,
    matched_rule_ids: decodeArray(row.matched_rule_ids),
    matched_rule_types: decodeArray(row.matched_rule_types),
    matched_hash_ids: decodeArray(row.matched_hash_ids),
  };
}

function normalizeHistoryFilters(filters = {}) {
  const page = Math.max(1, parseInt(filters.page || 1, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || 25, 10) || 25));
  return {
    page,
    limit,
    status: filters.status || null,
    reasonCode: filters.reasonCode || null,
    failureStage: filters.failureStage || null,
    manualReviewQueued: filters.manualReviewQueued == null ? null : Boolean(filters.manualReviewQueued),
    from: filters.from || null,
    to: filters.to || null,
  };
}

function applyHistoryFilters(query, filters = {}) {
  const f = normalizeHistoryFilters(filters);
  if (f.status) query.where({ status: f.status });
  if (f.reasonCode) query.where({ reason_code: f.reasonCode });
  if (f.failureStage) query.where({ failure_stage: f.failureStage });
  if (f.manualReviewQueued != null) query.where({ manual_review_queued: boolValue(f.manualReviewQueued) });
  if (f.from) query.where('created_at', '>=', f.from);
  if (f.to) query.where('created_at', '<=', f.to);
  return query;
}

function average(values) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!nums.length) return null;
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

function maxOrNull(values) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return nums.length ? Math.max(...nums) : null;
}

function increment(map, key) {
  const k = key || 'unknown';
  map[k] = (map[k] || 0) + 1;
}

async function legacyImageTextRows() {
  return db('image_text_blacklist')
    .select('id', 'pattern', 'pattern_type')
    .whereIn('pattern_type', ['keyword', 'domain'])
    .orderBy('id', 'asc');
}

function legacyRowToRule(row) {
  const type = row.pattern_type === 'domain' ? 'domain' : 'keyword';
  return {
    id: row.id,
    type,
    pattern: row.pattern,
    normalized_pattern: normalizeScamScanText(row.pattern),
    severity: 'auto',
    enabled: true,
  };
}

/**
 * Image archive / review queue, invite review queue, and scam-image blacklists.
 * Tables: image_review_approvals, pending_invites, pending_image_reviews,
 * image_text_blacklist, image_hash_blacklist.
 * Behavior and return shapes preserved verbatim from the original database/db.js.
 */
module.exports = {
  hasImageReviewApproval: async (guildId, userId) => {
    const row = await db('image_review_approvals')
      .where({ guild_id: guildId, user_id: userId })
      .first();
    return Boolean(row);
  },

  upsertImageReviewApproval: async (guildId, userId, approvedBy) => {
    const exists = await db('image_review_approvals')
      .where({ guild_id: guildId, user_id: userId })
      .first();
    if (exists) {
      await db('image_review_approvals')
        .where({ guild_id: guildId, user_id: userId })
        .update({ approved_by: approvedBy, approved_at: db.fn.now() });
    } else {
      await db('image_review_approvals').insert({
        guild_id: guildId,
        user_id: userId,
        approved_by: approvedBy,
        approved_at: db.fn.now(),
      });
    }
  },

  deleteImageReviewApproval: async (guildId, userId) => {
    await db('image_review_approvals').where({ guild_id: guildId, user_id: userId }).delete();
  },

  getPendingInviteById: async (id) => {
    return db('pending_invites').where({ id }).first();
  },

  insertPendingInvite: async (row) => {
    const res = await db('pending_invites').insert(row);
    const id = Array.isArray(res) ? res[0] : res;
    if (id != null) return Number(id);
    const r = await db.raw('SELECT LAST_INSERT_ID() AS id');
    const row0 = r && r[0];
    return Number((Array.isArray(row0) ? row0[0] : row0)?.id);
  },

  updatePendingInviteQueueMessage: async (id, queueMessageId) => {
    await db('pending_invites').where({ id }).update({ queue_message_id: queueMessageId });
  },

  /**
   * @returns {Promise<number>} affected rows
   */
  claimPendingInviteStatus: async (id, status, reviewedBy) => {
    const r = await db('pending_invites')
      .where({ id, status: 'pending' })
      .update({ status, reviewed_by: reviewedBy });
    return r;
  },

  expireStalePendingInvites: async (days = 7) => {
    return db('pending_invites')
      .where('status', 'pending')
      .andWhereRaw('created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [days])
      .update({ status: 'expired' });
  },

  insertPendingImageReview: async (row) => {
    const res = await db('pending_image_reviews').insert(row);
    const id = Array.isArray(res) ? res[0] : res;
    if (id != null) return Number(id);
    const r = await db.raw('SELECT LAST_INSERT_ID() AS id');
    const row0 = r && r[0];
    return Number((Array.isArray(row0) ? row0[0] : row0)?.id);
  },

  updatePendingImageReviewQueueMessage: async (id, queueMessageId) => {
    await db('pending_image_reviews').where({ id }).update({ queue_message_id: queueMessageId });
  },

  getPendingImageReviewById: async (id) => {
    return db('pending_image_reviews').where({ id }).first();
  },

  claimPendingImageReviewStatus: async (id, status, reviewedBy) => {
    return db('pending_image_reviews')
      .where({ id, status: 'pending' })
      .update({ status, reviewed_by: reviewedBy });
  },

  listOtherPendingImageReviewsByAuthor: async (homeGuildId, authorId, exceptId) => {
    const columns = ['id', 'queue_message_id'];
    if (await hasColumn('pending_image_reviews', 'moderation_history_id')) {
      columns.push('moderation_history_id');
    }
    return db('pending_image_reviews')
      .where({ home_guild_id: homeGuildId, author_id: authorId, status: 'pending' })
      .andWhere('id', '!=', exceptId)
      .select(columns);
  },

  resolveOtherPendingImageReviewsByAuthor: async (homeGuildId, authorId, exceptId, status, reviewedBy) => {
    return db('pending_image_reviews')
      .where({ home_guild_id: homeGuildId, author_id: authorId, status: 'pending' })
      .andWhere('id', '!=', exceptId)
      .update({ status, reviewed_by: reviewedBy });
  },

  getImageTextBlacklistRows: async () => {
    if (await hasScamScanRulesTable()) {
      return db('scam_scan_rules')
        .select('id', 'type as pattern_type', 'pattern', 'normalized_pattern', 'severity', 'enabled')
        .where({ enabled: true })
        .whereIn('type', ['keyword', 'domain'])
        .orderBy('id', 'asc');
    }
    return db('image_text_blacklist').select('id', 'pattern', 'pattern_type').orderBy('id', 'asc');
  },

  getImageHashBlacklistRows: async () => {
    return db('image_hash_blacklist').select('id', 'phash', 'description').orderBy('id', 'asc');
  },

  insertImageTextBlacklist: async ({ pattern, pattern_type, added_by }) => {
    if (await hasScamScanRulesTable()) {
      const type = pattern_type === 'domain' ? 'domain' : 'keyword';
      if (pattern_type === 'regex') {
        throw new Error('Regex image scam rules are not enabled yet.');
      }
      const normalized = normalizeScamScanText(pattern);
      await db('scam_scan_rules')
        .insert({
          type,
          pattern,
          normalized_pattern: normalized,
          severity: 'auto',
          enabled: true,
          created_by: added_by || null,
          updated_by: added_by || null,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
        .onConflict(['type', 'normalized_pattern'])
        .merge({
          pattern,
          severity: 'auto',
          enabled: true,
          updated_by: added_by || null,
          updated_at: db.fn.now(),
        });
    }
    await db('image_text_blacklist').insert({
      pattern,
      pattern_type,
      added_by: added_by || null,
      added_at: db.fn.now(),
    });
  },

  insertImageHashBlacklist: async ({ phash, description, added_by }) => {
    await db.raw(
      `INSERT INTO image_hash_blacklist (phash, description, added_by, added_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE description = VALUES(description), added_by = VALUES(added_by), added_at = NOW()`,
      [phash, description || null, added_by || null],
    );
  },

  listImageTextBlacklist: async (limit = 30) => {
    if (await hasScamScanRulesTable()) {
      return db('scam_scan_rules')
        .select('id', 'pattern', 'type as pattern_type', 'severity', 'enabled', 'created_by as added_by', 'created_at as added_at')
        .whereIn('type', ['keyword', 'domain'])
        .orderBy('id', 'desc')
        .limit(limit);
    }
    return db('image_text_blacklist').select('*').orderBy('id', 'desc').limit(limit);
  },

  listImageHashBlacklist: async (limit = 30) => {
    return db('image_hash_blacklist').select('*').orderBy('id', 'desc').limit(limit);
  },

  getEnabledScamScanRules: async () => {
    if (await hasScamScanRulesTable()) {
      return db('scam_scan_rules')
        .select('id', 'type', 'pattern', 'normalized_pattern', 'severity', 'enabled')
        .where({ enabled: true })
        .whereIn('type', ['keyword', 'domain'])
        .orderBy('id', 'asc');
    }
    const rows = await legacyImageTextRows();
    return rows.map(legacyRowToRule);
  },

  parseScamScanRulesText,

  replaceScamScanKeywordRulesFromText: async ({ text, userId }) => {
    const parsed = parseScamScanRulesText(text);
    if (!parsed.ok) return parsed;
    if (!(await hasScamScanRulesTable())) {
      throw new Error('scam_scan_rules table is missing; run migrations before editing scam scan rules.');
    }

    const existingRows = await db('scam_scan_rules')
      .select('*')
      .whereIn('type', ['keyword', 'domain']);
    const existingByNormalized = new Map(existingRows.map((row) => [`${row.type}:${row.normalized_pattern}`, row]));
    const desired = new Set(parsed.rules.map((rule) => `${rule.type}:${rule.normalized_pattern}`));
    const disableIds = existingRows
      .filter((row) => !desired.has(`${row.type}:${row.normalized_pattern}`))
      .map((row) => row.id);

    await db.transaction(async (trx) => {
      if (disableIds.length) {
        await trx('scam_scan_rules')
          .whereIn('id', disableIds)
          .update({
            enabled: false,
            updated_by: userId || null,
            updated_at: trx.fn.now(),
          });
      }

      for (const rule of parsed.rules) {
        const existing = existingByNormalized.get(`${rule.type}:${rule.normalized_pattern}`);
        if (existing) {
          await trx('scam_scan_rules')
            .where({ id: existing.id })
            .update({
              pattern: rule.pattern,
              enabled: true,
              updated_by: userId || null,
              updated_at: trx.fn.now(),
            });
        } else {
          await trx('scam_scan_rules').insert({
            type: rule.type,
            pattern: rule.pattern,
            normalized_pattern: rule.normalized_pattern,
            severity: 'review',
            enabled: true,
            created_by: userId || null,
            updated_by: userId || null,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
        }
      }
    });

    return { ok: true, errors: [], rules: parsed.rules };
  },

  exportScamScanRulesText: async () => {
    const rows = await module.exports.getEnabledScamScanRules();
    return exportScamScanRulesTextRows(rows);
  },

  testScamScanRulesAgainstText: async (text) => {
    const rows = await module.exports.getEnabledScamScanRules();
    return testScamScanRulesAgainstTextRows(text, rows);
  },

  recordScamScanHistory: async (entry) => {
    try {
      if (!(await hasScamScanHistoryTable())) return null;
      const matchedRules = entry.matchedRules || [];
      const matchedHashes = entry.matchedHashes || [];
      const row = {
        guild_id: entry.guildId,
        channel_id: entry.channelId,
        message_id: entry.messageId,
        attachment_id: entry.attachmentId || null,
        attachment_index: intOrNull(entry.attachmentIndex) || 0,
        attachment_url_hash: hashAttachmentUrl(entry.attachmentUrl),
        user_id: entry.userId,
        user_name: entry.userName ? String(entry.userName).slice(0, 100) : null,
        channel_name: entry.channelName ? String(entry.channelName).slice(0, 100) : null,
        is_staff_or_mod: boolValue(entry.isStaffOrMod),
        status: entry.status || 'failed',
        reason_code: entry.reasonCode || null,
        failure_stage: entry.failureStage || null,
        manual_review_required: boolValue(entry.manualReviewRequired),
        manual_review_queued: boolValue(entry.manualReviewQueued),
        matched_rule_ids: encodeArray(matchedRules.map((rule) => rule.id)),
        matched_rule_types: encodeArray(matchedRules.map((rule) => rule.type)),
        matched_hash_ids: encodeArray(matchedHashes.map((hash) => hash.id)),
        severity: entry.severity || null,
        image_bytes: intOrNull(entry.image?.bytes),
        image_width: intOrNull(entry.image?.width),
        image_height: intOrNull(entry.image?.height),
        image_format: entry.image?.format || null,
        timing_download_ms: intOrNull(entry.timings?.downloadMs),
        timing_preprocess_ms: intOrNull(entry.timings?.preprocessMs),
        timing_ocr_ms: intOrNull(entry.timings?.ocrMs),
        timing_rules_ms: intOrNull(entry.timings?.rulesMs),
        timing_phash_ms: intOrNull(entry.timings?.phashMs),
        timing_total_ms: intOrNull(entry.timings?.totalMs),
        ocr_preview: entry.ocrPreview ? String(entry.ocrPreview).slice(0, 500) : null,
        created_at: db.fn.now(),
      };

      return await db.transaction(async (trx) => {
        const res = await trx('scam_scan_history').insert(row);
        let id = Array.isArray(res) ? res[0] : res;
        if (id == null) {
          const r = await trx.raw('SELECT LAST_INSERT_ID() AS id');
          const row0 = r && r[0];
          id = (Array.isArray(row0) ? row0[0] : row0)?.id;
        }
        const historyId = Number(id);
        if (historyId && matchedRules.length) {
          for (const rule of matchedRules) {
            await trx('scam_scan_history_rule_hits').insert({
              scan_history_id: historyId,
              rule_id: rule.id == null ? null : String(rule.id),
              rule_type: rule.type || null,
              severity: rule.severity || entry.severity || null,
              created_at: trx.fn.now(),
            });
          }
        }
        return historyId || null;
      });
    } catch (e) {
      logger.warn('Failed to record scam scan history:', e);
      return null;
    }
  },

  getScamScanHistoryPage: async (filters = {}) => {
    if (!(await hasScamScanHistoryTable())) {
      return { page: 1, limit: 25, rows: [], hasMore: false };
    }
    const f = normalizeHistoryFilters(filters);
    const rows = await applyHistoryFilters(db('scam_scan_history').select('*'), f)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(f.limit + 1)
      .offset((f.page - 1) * f.limit);
    return {
      page: f.page,
      limit: f.limit,
      rows: rows.slice(0, f.limit).map(compactScanHistoryRow),
      hasMore: rows.length > f.limit,
    };
  },

  getScamScanMetrics: async (filters = {}) => {
    if (!(await hasScamScanHistoryTable())) {
      return {
        total: 0,
        byStatus: {},
        byReasonCode: {},
        byFailureStage: {},
        manualReviewQueued: 0,
        averages: {},
        max: {},
        slowRecent: [],
      };
    }
    const rows = await applyHistoryFilters(db('scam_scan_history').select('*'), filters)
      .orderBy('created_at', 'desc');
    const byStatus = {};
    const byReasonCode = {};
    const byFailureStage = {};
    for (const row of rows) {
      increment(byStatus, row.status);
      increment(byReasonCode, row.reason_code);
      increment(byFailureStage, row.failure_stage);
    }
    const timing = (key) => rows.map((row) => intOrNull(row[key])).filter((value) => value != null);
    return {
      total: rows.length,
      byStatus,
      byReasonCode,
      byFailureStage,
      manualReviewQueued: rows.filter((row) => Boolean(row.manual_review_queued)).length,
      averages: {
        totalMs: average(timing('timing_total_ms')),
        downloadMs: average(timing('timing_download_ms')),
        preprocessMs: average(timing('timing_preprocess_ms')),
        ocrMs: average(timing('timing_ocr_ms')),
        rulesMs: average(timing('timing_rules_ms')),
        phashMs: average(timing('timing_phash_ms')),
      },
      max: {
        totalMs: maxOrNull(timing('timing_total_ms')),
        downloadMs: maxOrNull(timing('timing_download_ms')),
        preprocessMs: maxOrNull(timing('timing_preprocess_ms')),
        ocrMs: maxOrNull(timing('timing_ocr_ms')),
        rulesMs: maxOrNull(timing('timing_rules_ms')),
        phashMs: maxOrNull(timing('timing_phash_ms')),
      },
      slowRecent: rows
        .slice()
        .sort((a, b) => (Number(b.timing_total_ms) || 0) - (Number(a.timing_total_ms) || 0))
        .slice(0, 10)
        .map(compactScanHistoryRow),
    };
  },

  getScamScanRuleHitMetrics: async (filters = {}) => {
    if (!(await hasScamScanHistoryTable()) || !(await db.schema.hasTable('scam_scan_history_rule_hits'))) {
      return [];
    }
    const f = normalizeHistoryFilters(filters);
    let query = db('scam_scan_history_rule_hits').select('*');
    if (f.from) query = query.where('created_at', '>=', f.from);
    if (f.to) query = query.where('created_at', '<=', f.to);
    const rows = await query.orderBy('created_at', 'desc');
    const grouped = new Map();
    for (const row of rows) {
      const key = `${row.rule_id || 'unknown'}:${row.rule_type || 'unknown'}:${row.severity || ''}`;
      const existing = grouped.get(key) || {
        rule_id: row.rule_id || null,
        rule_type: row.rule_type || null,
        severity: row.severity || null,
        hit_count: 0,
        latest_hit_at: row.created_at,
      };
      existing.hit_count += 1;
      if (String(row.created_at) > String(existing.latest_hit_at)) existing.latest_hit_at = row.created_at;
      grouped.set(key, existing);
    }
    return [...grouped.values()].sort((a, b) => b.hit_count - a.hit_count).slice(0, 50);
  },

  deleteOldScamScanHistory: async ({ olderThanDays = SCAM_SCAN_HISTORY_RETENTION_DAYS } = {}) => {
    if (!(await hasScamScanHistoryTable())) return 0;
    const days = Math.max(1, parseInt(olderThanDays, 10) || SCAM_SCAN_HISTORY_RETENTION_DAYS);
    return db('scam_scan_history')
      .where('created_at', '<', db.raw('DATE_SUB(NOW(), INTERVAL ? DAY)', [days]))
      .delete();
  },

  getScamScanSettingDefinitions: () => SCAM_SCAN_SETTING_DEFINITIONS,

  getDefaultScamScanSettings: () => defaultScamScanSettings(),

  parseScamScanSettingsInput,

  clearScamScanSettingsCache: () => {
    scamScanSettingsCache = { t: 0, settings: null };
    scamScanSettingsInvalidRowsWarnedAt = 0;
  },

  getScamScanSettings: async () => {
    const now = Date.now();
    if (scamScanSettingsCache.settings && now - scamScanSettingsCache.t < SCAM_SCAN_SETTINGS_CACHE_MS) {
      return { ...scamScanSettingsCache.settings };
    }
    if (!(await hasScamScanSettingsTable())) {
      const defaults = defaultScamScanSettings();
      scamScanSettingsCache = { t: now, settings: defaults };
      return { ...defaults };
    }
    const rows = await db('scam_scan_settings').select('key', 'value');
    const parsed = hydrateScamScanSettingsRows(rows);
    if (parsed.errors.length && now - scamScanSettingsInvalidRowsWarnedAt > SCAM_SCAN_SETTINGS_CACHE_MS) {
      scamScanSettingsInvalidRowsWarnedAt = now;
      for (const error of parsed.errors) {
        logger.warn(`Invalid scam scan setting row ignored: ${error}`);
      }
    }
    const settings = parsed.settings;
    scamScanSettingsCache = { t: now, settings };
    return { ...settings };
  },

  replaceScamScanSettings: async ({ settings, userId }) => {
    const parsed = parseScamScanSettingsInput(settings);
    if (!parsed.ok) return parsed;
    if (!(await hasScamScanSettingsTable())) {
      throw new Error('scam_scan_settings table is missing; run migrations before editing scam scan settings.');
    }

    await db.transaction(async (trx) => {
      for (const [key, value] of Object.entries(parsed.settings)) {
        await trx('scam_scan_settings')
          .insert({
            key,
            value: serializeScamScanSettingValue(value),
            updated_by: userId || null,
            updated_at: trx.fn.now(),
          })
          .onConflict('key')
          .merge({
            value: serializeScamScanSettingValue(value),
            updated_by: userId || null,
            updated_at: trx.fn.now(),
          });
      }
    });

    module.exports.clearScamScanSettingsCache();
    return parsed;
  },
};
