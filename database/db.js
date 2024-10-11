const knex = require('knex');
const config = require('../.config');
const logger = require('silly-logger');

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

db.raw('SELECT 1')
  .then(() => {
    logger.info('Knex pool established');
  })
  .catch(err => {
    logger.error('Error connecting to the database:', err);
  });

module.exports = {
  query: db,
  end: () => db.destroy(),

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

  
  createCage: async (userId, expires_at, cagedBy, cagedById, timestamp, reason) => {
    await db.table('caged_users').insert({
      discord_id: userId,
      expires_at: expires_at,
      caged_by_user: cagedBy,
      caged_by_id: cagedById,
      created_at: timestamp,
      reason: reason
    });
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

  getUserRank: async (userId) => {
    const rows = await db.table('user_xp')
      .count('* as rank')
      .where('xp', '>', db('user_xp').select('xp').where({user_id: userId}))
      .then(count => count[0].rank + 1);

    return rows;
  },

  getXPSettings: async () => {
    const [rows] = await db.table('xp_settings').select('*').limit(1);
    return rows;
  },

  getExpiredCagedUsers: async (currentTime) => {
    const [rows] = await db.table('caged_users').where('expires', '>', 0).andWhere('expires', '<=', currentTime);
    return rows;
  },

  getCage: async (userId) => {
    const [rows] = await db.table('caged_users').select('discord_id', 'expires').where({discord_id: userId});
    return rows;
  },

  getCagedUsers: async (currentTime) => {
    const rows = await db.table('caged_users').select('discord_id', 'expires').where({expires_at: 0}).orWhere('expires', '>', currentTime).orderBy('expires', 'asc').limit(5);
    return rows;
  },

  getChannelStats: async (channelId, currentDate) => {
    const [rows] = await db.table('channel_stats').where({channel_id: channelId}).andWhere({month_day: currentDate}).select('*');
    return rows;
  },

  getGuildConfigurable: async (guildId) => {
    const [rows] = await db.table('GuildConfigurable').select('*').where({guildId: guildId});
    return rows;
  },

  getAfkUser: async (userId, guildId) => {
    const rows = await db.table('afk_users').select('*').where({user_id: userId}).andWhere({guild_id: guildId});
    return rows;
  },

  getChannelStats: async (channelId, currentDate) => {
    const [rows] = await db.table('channel_stats').select('*').where({channel_id: channelId}).andWhere({month_day: currentDate});
    return rows;
  },

  getCommand: async (commandNameHash) => {
    const rows = await db.table('commands').select('hash', 'content', 'usage').where({hash: commandNameHash});
    return rows;
  },

  getLeaderboard: async (limit = 10) => {
    const [rows] = await db('user_xp').join('users', 'user_xp.user_id','=', 'users.discord_id').select('user_xp.*', 'users.username').limit(limit);
    const leaderboard = [];
    for (const row of rows) {
      leaderboard.push({
        user_id: row.user_id,
        username: row.username,
        xp: row.xp,
        level: row.level
      });
    }
    return leaderboard;
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
  
  toggleDoubleXP: async (enabled) => {
    await db.table('xp_settings').update({double_xp_enabled: enabled}).where({id: 1});
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
  
  updateXPSettings: async (settings) => {
    await db.table('xp_settings').update(settings).where({ id: 1 });
  },

  updateChannelStats: async (channelId, currentDate) => {
    await db.table('channel_stats').update({total: total+1}).where({channel_id: channelId}).andWhere({month_day: currentDate});
  },
  
  updateCommandUsage: async (commandNameHash, newUsageCount) => {
    await db.table('commands').update({usage: newUsageCount}).where({hash: commandNameHash});
  },

};