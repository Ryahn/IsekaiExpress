const db = require('../knex');

/**
 * XP / leveling / message-count data access. Tables: user_xp, xp_settings, users,
 * user_guild_message_counts. Behavior, SQL semantics, and return shapes are preserved
 * verbatim from the original database/db.js.
 */
const self = (module.exports = {
  checkUser: async (user) => {
    const userId = user.id;
    const username = user.username;

    // Atomic upsert (relies on the users_discord_id_unique index). Replaces the previous
    // read-then-insert, which raced on first-seen users and created duplicate rows. Only the
    // username is refreshed on conflict; avatar/roles/is_admin are left untouched.
    await db('users')
      .insert({ discord_id: userId, username: username })
      .onConflict('discord_id')
      .merge({ username: username });
  },

  getUserXP: async (userId) => {
    const rows = await db.table('user_xp').where({ user_id: userId });
    if (rows.length === 0) {
      await db.table('user_xp').insert({ user_id: userId });
      return { xp: 0, level: 1, message_count: 0 };
    }
    return rows[0];
  },

  getUserRank: async (userId) => {
    const rows = await db.table('user_xp')
      .count('* as rank')
      .where('xp', '>', db('user_xp').select('xp').where({ user_id: userId }))
      .then((count) => count[0].rank + 1);

    return rows;
  },

  getLeaderboard: async (limit = 10) => {
    const rows = await db('user_xp')
      .join('users', 'user_xp.user_id', '=', 'users.discord_id')
      .select('user_xp.*', 'users.username')
      .orderBy('user_xp.xp', 'desc')
      .limit(limit);
    return rows.map((row) => ({
      user_id: row.user_id,
      username: row.username,
      xp: row.xp,
      level: row.level,
    }));
  },

  getLeaderboardPage: async ({ page = 1, limit = 25 } = {}) => {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (safePage - 1) * safeLimit;

    const countRow = await db('user_xp').count('* as c').first();
    const total = Number(Object.values(countRow || {})[0] || 0);
    const pages = Math.max(1, Math.ceil(total / safeLimit));

    const rows = await db('user_xp')
      .join('users', 'user_xp.user_id', '=', 'users.discord_id')
      .select(
        'user_xp.user_id',
        'user_xp.xp',
        'user_xp.level',
        'user_xp.message_count',
        'users.username',
      )
      .orderBy('user_xp.xp', 'desc')
      .orderBy('user_xp.user_id', 'asc')
      .limit(safeLimit)
      .offset(offset);

    return {
      rows: rows.map((row) => ({
        user_id: row.user_id,
        username: row.username,
        xp: Number(row.xp) || 0,
        level: Number(row.level) || 0,
        message_count: Number(row.message_count) || 0,
      })),
      total,
      page: safePage,
      pages,
      limit: safeLimit,
    };
  },

  getXpSummary: async () => {
    const countRow = await db('user_xp').count('* as c').first();
    const sumRow = await db('user_xp').sum('xp as s').first();
    return {
      rankedUsers: Number(Object.values(countRow || {})[0] || 0),
      totalXp: Number(Object.values(sumRow || {})[0] || 0),
    };
  },

  /**
   * Ensure a row exists for guildId when the table is guild-scoped (has guildId column).
   * Legacy `id`-only tables are left unchanged.
   */
  ensureXPSettingsForGuild: async (guildId) => {
    if (!guildId) return;
    const first = await db.table('xp_settings').first();
    if (!first) return;
    if (first.guildId === undefined && first.id !== undefined) return;
    const existing = await db.table('xp_settings').where({ guildId }).first();
    if (existing) return;
    try {
      await db.table('xp_settings').insert({
        guildId,
        messages_per_xp: 1,
        min_xp_per_gain: 15,
        max_xp_per_gain: 15,
        message_xp_cooldown_seconds: 60,
        weekend_multiplier: 2,
        weekend_days: 'sat,sun',
        double_xp_enabled: false,
      });
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT') throw e;
    }
  },

  getXPSettings: async (guildId) => {
    if (guildId) {
      await self.ensureXPSettingsForGuild(guildId);
    }
    const first = await db.table('xp_settings').first();
    if (!first) {
      return {
        messages_per_xp: 1,
        min_xp_per_gain: 15,
        max_xp_per_gain: 15,
        message_xp_cooldown_seconds: 60,
        weekend_multiplier: 2,
        weekend_days: 'sat,sun',
        double_xp_enabled: false,
      };
    }
    if (first.guildId !== undefined && guildId) {
      const match = await db.table('xp_settings').where({ guildId }).first();
      if (match) return match;
    }
    return first;
  },

  toggleDoubleXP: async (enabled, guildId) => {
    const s = await self.getXPSettings(guildId);
    if (s && s.guildId != null) {
      await db.table('xp_settings').where({ guildId: s.guildId }).update({ double_xp_enabled: enabled });
      return;
    }
    if (s && s.id != null) {
      await db.table('xp_settings').where({ id: s.id }).update({ double_xp_enabled: enabled });
      return;
    }
    const first = await db.table('xp_settings').first();
    if (!first) return;
    if (first.guildId != null) {
      await db.table('xp_settings').where({ guildId: first.guildId }).update({ double_xp_enabled: enabled });
      return;
    }
    if (first.id != null) {
      await db.table('xp_settings').where({ id: first.id }).update({ double_xp_enabled: enabled });
    }
  },

  updateUserXP: async (userId, xp, messageCount = 0, level = 1) => {
    xp = xp || 0;
    await db.table('user_xp').where({ user_id: userId }).update({ xp: xp, message_count: messageCount, level: level });
  },

  updateUserXPAndLevel: async (userId, xp, level, messageCount) => {
    await db.table('user_xp').update({ xp: xp, message_count: messageCount, level: level }).where({ user_id: userId });
  },

  /**
   * Atomically add XP to a user and recompute level under a row lock, eliminating the
   * read-modify-write lost-update race that occurs when a user triggers XP from multiple
   * channels concurrently. Level never decreases here (passive message XP only levels up).
   *
   * @param {string} userId discord snowflake (user_xp.user_id)
   * @param {number} xpGain XP to add (>= 0)
   * @param {(xp:number)=>number} computeLevel level formula (injected to avoid a libs/utils circular require)
   * @returns {Promise<{xp:number, level:number, oldLevel:number, leveledUp:boolean}>}
   */
  addUserXP: async (userId, xpGain, computeLevel) => {
    const gain = Math.max(0, Math.floor(Number(xpGain) || 0));
    return db.transaction(async (trx) => {
      let row = await trx('user_xp').where({ user_id: userId }).forUpdate().first();
      if (!row) {
        await trx('user_xp')
          .insert({ user_id: userId, xp: 0, level: 0, message_count: 0 })
          .onConflict('user_id')
          .ignore();
        row = await trx('user_xp').where({ user_id: userId }).forUpdate().first();
      }
      const oldXp = Number(row.xp) || 0;
      const oldLevel = Number(row.level) || 0;
      const newXp = oldXp + gain;
      const newLevel = Math.max(oldLevel, computeLevel(newXp));
      await trx('user_xp').where({ user_id: userId }).update({ xp: newXp, level: newLevel });
      return { xp: newXp, level: newLevel, oldLevel, leveledUp: newLevel > oldLevel };
    });
  },

  updateUserMessageCount: async (userId, messageCount) => {
    await db.table('user_xp').update({ message_count: messageCount }).where({ user_id: userId });
  },

  updateXPSettings: async (settings, guildId) => {
    if (guildId) {
      await self.ensureXPSettingsForGuild(guildId);
    }
    const s = await self.getXPSettings(guildId);
    if (s && s.guildId != null) {
      await db.table('xp_settings').where({ guildId: s.guildId }).update(settings);
      return;
    }
    if (s && s.id != null) {
      await db.table('xp_settings').where({ id: s.id }).update(settings);
      return;
    }
    const first = await db.table('xp_settings').first();
    if (!first) return;
    if (first.guildId != null) {
      await db.table('xp_settings').where({ guildId: first.guildId }).update(settings);
      return;
    }
    if (first.id != null) {
      await db.table('xp_settings').where({ id: first.id }).update(settings);
    }
  },

  incrementGuildUserMessageCount: async (guildId, userId) => {
    await db.raw(
      'INSERT INTO user_guild_message_counts (guild_id, user_id, message_count) VALUES (?, ?, 1) ' +
        'ON DUPLICATE KEY UPDATE message_count = message_count + 1',
      [guildId, userId],
    );
  },

  getGuildUserMessageCount: async (guildId, userId) => {
    const row = await db('user_guild_message_counts')
      .where({ guild_id: guildId, user_id: userId })
      .first();
    return row ? Number(row.message_count) || 0 : 0;
  },
});
