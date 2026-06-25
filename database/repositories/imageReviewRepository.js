const db = require('../knex');

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
    return db('image_text_blacklist').select('id', 'pattern', 'pattern_type').orderBy('id', 'asc');
  },

  getImageHashBlacklistRows: async () => {
    return db('image_hash_blacklist').select('id', 'phash', 'description').orderBy('id', 'asc');
  },

  insertImageTextBlacklist: async ({ pattern, pattern_type, added_by }) => {
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
    return db('image_text_blacklist').select('*').orderBy('id', 'desc').limit(limit);
  },

  listImageHashBlacklist: async (limit = 30) => {
    return db('image_hash_blacklist').select('*').orderBy('id', 'desc').limit(limit);
  },
};
