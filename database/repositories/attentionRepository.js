const db = require('../knex');

/**
 * Attention-request system plus miscellaneous utility data that does not belong to another
 * domain. Tables: attention_requests, channel_stats, afk_users.
 * (channel_stats and afk_users are placed here as the designated misc/utility bucket; they
 * can be relocated to dedicated repositories later without changing call sites.)
 * Behavior and return shapes preserved verbatim from the original database/db.js.
 */
module.exports = {
  insertAttentionRequest: async (row) => {
    const res = await db('attention_requests').insert(row);
    const id = Array.isArray(res) ? res[0] : res;
    if (id != null) return Number(id);
    const r = await db.raw('SELECT LAST_INSERT_ID() AS id');
    const row0 = r && r[0];
    return Number((Array.isArray(row0) ? row0[0] : row0)?.id);
  },

  setAttentionRequestQueueMessage: async (id, queueMessageId, queueChannelId) => {
    await db('attention_requests')
      .where({ id })
      .update({ queue_message_id: queueMessageId, queue_channel_id: queueChannelId });
  },

  getAttentionRequestById: async (id) => {
    return db('attention_requests').where({ id }).first();
  },

  /**
   * @returns {Promise<number>} affected rows (1 if claimed from pending)
   */
  claimAttentionRequestStatus: async (id, status, reviewedBy) => {
    return db('attention_requests')
      .where({ id, status: 'pending' })
      .update({
        status,
        reviewed_by: reviewedBy,
        resolved_at: db.fn.now(),
      });
  },

  // --- Misc / utility: channel statistics ---
  createChannelStats: async (channelId, channelName, currentDate) => {
    await db.table('channel_stats').insert({ channel_id: channelId, channel_name: channelName, month_day: currentDate, total: 1 });
  },

  getChannelStats: async (channelId, currentDate) => {
    const row = await db.table('channel_stats')
      .select('*')
      .where({ channel_id: channelId, month_day: currentDate })
      .first();
    return row;
  },

  updateChannelStats: async (channelId, currentDate) => {
    await db.table('channel_stats')
      .where({ channel_id: channelId, month_day: currentDate })
      .increment('total', 1);
  },

  // --- Misc / utility: AFK users ---
  createAfkUser: async (userId, guildId, message, timestamp) => {
    await db.table('afk_users').insert({
      user_id: userId,
      guild_id: guildId,
      message: message,
      timestamp: timestamp,
    }).onConflict(['user_id', 'guild_id']).merge({ message: message, timestamp: timestamp });
  },

  deleteAfkUser: async (userId, guildId) => {
    await db.table('afk_users').where({ user_id: userId }).andWhere({ guild_id: guildId }).delete();
  },

  getAfkUser: async (userId, guildId) => {
    const rows = await db.table('afk_users').select('*').where({ user_id: userId }).andWhere({ guild_id: guildId });
    return rows;
  },
};
