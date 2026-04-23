const knex = require('knex');
const config = require('../config');
const logger = require('silly-logger');
const { Model } = require('objection');
/** Do not import libs/utils here — it would require this module for `db` and create a circular dependency. */
const nowUnix = () => Math.floor(Date.now() / 1000);
const fs = require('fs');
const path = require('path');

const db = knex({
  client: 'mysql2',
  connection: {
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    port: config.mysql.port
  },
  pool: { min: 2, max: 10 }
});

Model.knex(db);

const models = {};
const modelsPath = path.join(__dirname, './models');

fs.readdirSync(modelsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const modelName = file.split('.')[0];
    models[modelName] = require(path.join(modelsPath, file));
  }
});

db.raw('SELECT 1')
  .then(() => {
    logger.info('Knex pool established');
  })
  .catch(err => {
    logger.error('Error connecting to the database:', err);
  });

const self = module.exports = {
  ...models,
  query: db,
  db: db,
  end: () => db.destroy(),

  /**
   * Run raw SQL. Resolves to the first result set: row array for SELECT, or
   * a ResultSetHeader-like object for INSERT/UPDATE/DELETE (mysql2).
   */
  sql: (query, bindings = []) => db.raw(query, bindings).then((result) => result[0]),

  checkUser: async (user) => {
    const userId = user.id;
    const username = user.username;

    const row = await db.table('users').where({discord_id: userId});
    if (row.length === 0) {
      await db.table('users').insert({discord_id: userId, username: username});
    } else {
      await db.table('users').update({username: username}).where({discord_id: userId});
    }
  },

  
  createCage: async (userId, expires_at, cagedBy, cagedById, timestamp, reason, roleId) => {
    await db.table('caged_users').insert({
      discord_id: userId,
      expires: expires_at,
      caged_by_user: cagedBy,
      caged_by_id: cagedById,
      created_at: timestamp,
      reason: reason,
      role_id: roleId
    });
  },

  getCageRoleId: async (userId) => {
    const [rows] = await db.table('caged_users').select('role_id').where({discord_id: userId});
    return rows.role_id;
  },

  
  createChannelStats: async (channelId, channelName, currentDate) => {
    await db.table('channel_stats').insert({channel_id: channelId, channel_name: channelName, month_day: currentDate, total: 1});
  },

  createBan: async (discordId, username, reason, method, bannedById, bannedByUser, createdAt) => {
    await db.table('bans').insert({ 
      discord_id: discordId, 
      username: username, 
      reason: reason, 
      method: method, 
      banned_by_id: bannedById, 
      banned_by_user: bannedByUser, 
      created_at: createdAt 
    });
  },

  createGuild: async (guildId, ownerId) => {
    await db.table('Guilds').insert({guildId: guildId, owner_id: ownerId});
  },

  createGuildConfigurable: async (guildId) => {
    await db.table('GuildConfigurable').insert({guildId: guildId});
  },

  
  createWarning: async (warn_id, warn_user_id, warn_user, warn_by_user, warn_by_id, warn_reason, timestamp) => {
    await db.table('warnings').insert({
      warn_id: warn_id,
      warn_user_id: warn_user_id,
      warn_user: warn_user,
      warn_by_user: warn_by_user,
      warn_by_id: warn_by_id,
      warn_reason: warn_reason,
      created_at: timestamp,
      updated_at: timestamp
    });
  },

  createAfkUser: async (userId, guildId, message, timestamp) => {
    await db.table('afk_users').insert({
      user_id: userId,
      guild_id: guildId,
      message: message,
      timestamp: timestamp
    }).onConflict(['user_id', 'guild_id']).merge({ message: message, timestamp: timestamp });
  },

  deleteWarning: async (warnId) => {
    await db.table('warnings').where({warn_id: warnId}).delete();
  },
  
  deleteAfkUser: async (userId, guildId) => {
    await db.table('afk_users').where({user_id: userId}).andWhere({guild_id: guildId}).delete();
  },
  
  deleteGuild: async (guildId) => {
    await db.table('Guilds').where({guildId: guildId}).delete();
  },

  deleteGuildConfigurable: async (guildId) => {
    await db.table('GuildConfigurable').where({guildId: guildId}).delete();
  },

  getUserXP: async (userId) => {
    const rows = await db.table('user_xp').where({ user_id: userId });
    if (rows.length === 0) {
      await db.table('user_xp').insert({ user_id: userId });
      return { xp: 0, level: 1, message_count: 0 };
    }
    return rows[0];
  },

  updateCardDescription: async (uuid, description) => {
    await db.table('card_data').where('uuid', uuid).update({ description: description });
    const card = await db.table('card_data').where('uuid', uuid).first();
    return card;
  },

  createCommandSettings: async (name, hash, category = 'misc', channelId = '351435045921357824',) => {
    await db.table('command_settings').insert({name: name, hash: hash, channel_id: channelId, category: category, created_at: nowUnix(), updated_at: nowUnix()}).onConflict('hash').ignore();
  },

  getAllowedChannel: async (hash) => {
    const [rows] = await db.table('command_settings').select('channel_id').where({hash: hash});
    return rows;
  },

  getCommandSettingsByHash: async (hash) => {
    const [rows] = await db.table('command_settings').select('*').where({hash: hash});
    return rows;
  },

  getCommandSettings: async (itemsPerPage = 10, offset = 0) => {
    const rows = await db.table('command_settings').select('*').orderBy('name', 'asc').limit(itemsPerPage).offset(offset);
    return rows;
  },

  updateCommandSettings: async (hash, channelId) => {
    await db.table('command_settings').update({channel_id: channelId}).where({hash: hash});
  },

  createCard: async (card) => {
    await db.table('card_data').insert(card).onConflict('uuid').merge();
  },

  getUserRank: async (userId) => {
    const rows = await db.table('user_xp')
      .count('* as rank')
      .where('xp', '>', db('user_xp').select('xp').where({user_id: userId}))
      .then(count => count[0].rank + 1);

    return rows;
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
        messages_per_xp: 3,
        min_xp_per_gain: 1,
        max_xp_per_gain: 5,
        weekend_multiplier: 2,
        weekend_days: 'sat,sun',
        double_xp_enabled: false
      });
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT') throw e;
    }
  },

  getXPSettings: async (guildId) => {
    if (guildId) {
      await self.ensureXPSettingsForGuild(guildId);
    }
    const rows = await db.table('xp_settings').select('*');
    if (!rows.length) {
      return {
        messages_per_xp: 3,
        min_xp_per_gain: 1,
        max_xp_per_gain: 3,
        weekend_multiplier: 2,
        weekend_days: 'sat,sun',
        double_xp_enabled: false
      };
    }
    if (rows[0].guildId !== undefined && guildId) {
      const match = rows.find((r) => String(r.guildId) === String(guildId));
      if (match) return match;
    }
    return rows[0];
  },

  getExpiredCagedUsers: async (currentTime) => {
    const rows = await db.table('caged_users').where('expires', '>', 0).andWhere('expires', '<=', currentTime);
    
    return !rows.length ? false : rows;
  },

  getCage: async (userId) => {
    const [rows] = await db.table('caged_users').select('discord_id', 'expires').where({discord_id: userId});
    return rows;
  },

  getCagedUsers: async (currentTime) => {
    const rows = await db.table('caged_users').select('*').where({expires: 0}).orWhere('expires', '>', currentTime).orderBy('expires', 'asc').limit(5);
    return rows;
  },

  getChannelStats: async (channelId, currentDate) => {
    const row = await db.table('channel_stats')
      .select('*')
      .where({ channel_id: channelId, month_day: currentDate })
      .first();
    return row;
  },

  getGuildConfigurable: async (guildId) => {
    const [rows] = await db.table('GuildConfigurable').select('*').where({guildId: guildId});
    return rows;
  },

  /**
   * @param {object} options
   * @param {boolean} [options.locked]
   * @param {string[]|null} [options.whitelistChannelIds] — set to [] or null to clear; omit to leave unchanged
   */
  updateGuildGlobalCommandLock: async (guildId, options = {}) => {
    const { locked, whitelistChannelIds } = options;
    const patch = {};
    if (typeof locked === 'boolean') {
      patch.global_commands_locked = locked;
    }
    if (whitelistChannelIds !== undefined) {
      patch.global_commands_whitelist_channel_ids = whitelistChannelIds && whitelistChannelIds.length
        ? JSON.stringify(whitelistChannelIds)
        : null;
    }
    if (Object.keys(patch).length === 0) return;
    await db.table('GuildConfigurable').where({ guildId }).update(patch);
  },

  getAfkUser: async (userId, guildId) => {
    const rows = await db.table('afk_users').select('*').where({user_id: userId}).andWhere({guild_id: guildId});
    return rows;
  },

  getCommand: async (commandNameHash) => {
    return db.table('commands').select('hash', 'content', 'usage').where({ hash: commandNameHash }).first();
  },

  ensureAppStateRow: async () => {
    const row = await db.table('app_state').where({ id: 1 }).first();
    if (!row) {
      await db.table('app_state').insert({ id: 1, custom_commands_revision: 0 });
    }
  },

  getCustomCommandsRevision: async () => {
    await self.ensureAppStateRow();
    const row = await db.table('app_state').select('custom_commands_revision').where({ id: 1 }).first();
    return row ? Number(row.custom_commands_revision) : 0;
  },

  bumpCustomCommandsRevision: async () => {
    await self.ensureAppStateRow();
    await db.table('app_state').where({ id: 1 }).increment('custom_commands_revision', 1);
  },

  getAllCustomCommandsForCache: async () => {
    return db.table('commands').select('hash', 'content');
  },

  refreshCustomCommandsCache: async (client) => {
    const rows = await self.getAllCustomCommandsForCache();
    const map = new Map();
    for (const r of rows) {
      map.set(r.hash, r.content);
    }
    client.customCommandsByHash = map;
    client.customCommandsRevision = await self.getCustomCommandsRevision();
  },

  incrementCustomCommandUsage: async (commandNameHash) => {
    await db.table('commands').increment('usage', 1).where({ hash: commandNameHash });
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
      level: row.level
    }));
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
  
  removeBan: async (discordId) => {
    await db.table('bans').where({discord_id: discordId}).delete();
  },

  removeCage: async (userId) => {
    await db.table('caged_users').where({discord_id: userId}).delete()
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
    await db.table('user_xp').where({user_id: userId}).update({xp: xp, message_count: messageCount, level: level});
  },

  updateUserXPAndLevel: async (userId, xp, level, messageCount) => {
    await db.table('user_xp').update({xp: xp, message_count: messageCount, level: level}).where({user_id: userId});
  },

  updateUserMessageCount: async (userId, messageCount) => {
    await db.table('user_xp').update({message_count: messageCount}).where({user_id: userId});
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

  updateChannelStats: async (channelId, currentDate) => {
    await db.table('channel_stats')
      .where({ channel_id: channelId, month_day: currentDate })
      .increment('total', 1);
  },
  
};