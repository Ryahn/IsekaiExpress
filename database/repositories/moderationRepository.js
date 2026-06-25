const db = require('../knex');

/**
 * Moderation / punishment records. Tables: warnings, bans, caged_users.
 * Behavior and return shapes preserved verbatim from the original database/db.js.
 */
module.exports = {
  createWarning: async (warn_id, warn_user_id, warn_user, warn_by_user, warn_by_id, warn_reason, timestamp) => {
    await db.table('warnings').insert({
      warn_id: warn_id,
      warn_user_id: warn_user_id,
      warn_user: warn_user,
      warn_by_user: warn_by_user,
      warn_by_id: warn_by_id,
      warn_reason: warn_reason,
      created_at: timestamp,
      updated_at: timestamp,
    });
  },

  deleteWarning: async (warnId) => {
    await db.table('warnings').where({ warn_id: warnId }).delete();
  },

  getWarningsOffset: async (userId, itemsPerPage, offset) => {
    const rows = await db.table('warnings')
      .select('warn_id', 'warn_by_user', 'warn_by_id', 'warn_reason', 'created_at')
      .where({ warn_user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(itemsPerPage)
      .offset(offset);
    return rows;
  },

  createBan: async (discordId, username, reason, method, bannedById, bannedByUser, createdAt) => {
    await db.table('bans').insert({
      discord_id: discordId,
      username: username,
      reason: reason,
      method: method,
      banned_by_id: bannedById,
      banned_by_user: bannedByUser,
      created_at: createdAt,
    });
  },

  removeBan: async (discordId) => {
    await db.table('bans').where({ discord_id: discordId }).delete();
  },

  createCage: async (userId, expires_at, cagedBy, cagedById, timestamp, reason, roleId) => {
    await db.table('caged_users').insert({
      discord_id: userId,
      expires: expires_at,
      caged_by_user: cagedBy,
      caged_by_id: cagedById,
      created_at: timestamp,
      reason: reason,
      role_id: roleId,
    });
  },

  getCageRoleId: async (userId) => {
    const [rows] = await db.table('caged_users').select('role_id').where({ discord_id: userId });
    return rows.role_id;
  },

  getExpiredCagedUsers: async (currentTime) => {
    const rows = await db.table('caged_users').where('expires', '>', 0).andWhere('expires', '<=', currentTime);

    return !rows.length ? false : rows;
  },

  getCage: async (userId) => {
    const [rows] = await db.table('caged_users').select('discord_id', 'expires').where({ discord_id: userId });
    return rows;
  },

  getCagedUsers: async (currentTime) => {
    const rows = await db.table('caged_users').select('*').where({ expires: 0 }).orWhere('expires', '>', currentTime).orderBy('expires', 'asc').limit(5);
    return rows;
  },

  removeCage: async (userId) => {
    await db.table('caged_users').where({ discord_id: userId }).delete();
  },
};
