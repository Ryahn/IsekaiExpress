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

async function hasScamScanRulesTable() {
  return db.schema.hasTable('scam_scan_rules');
}

async function hasScamScanSettingsTable() {
  return db.schema.hasTable('scam_scan_settings');
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
    return db('pending_image_reviews')
      .where({ home_guild_id: homeGuildId, author_id: authorId, status: 'pending' })
      .andWhere('id', '!=', exceptId)
      .select('id', 'queue_message_id');
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
