const mysql = require('mysql2/promise');
const config = require('../.config');
// Create a connection pool
const pool = mysql.createPool({
  host: config.mysql.host,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  port: config.mysql.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
pool.getConnection()
  .then(connection => {
    console.log('MySQL pool established');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to the database:', err);
  });

module.exports = {
  query: (sql, params) => pool.query(sql, params),

  getUserXP: async (userId) => {
    const [rows] = await pool.query('SELECT * FROM user_xp WHERE user_id = ?', [userId]);
    if (rows.length === 0) {
      await pool.query('INSERT INTO user_xp (user_id) VALUES (?)', [userId]);
      return { xp: 0, message_count: 0 };
    }
    return rows[0];
  },

  updateUserXP: async (userId, xp, messageCount) => {
    await pool.query('UPDATE user_xp SET xp = ?, message_count = ? WHERE user_id = ?', [xp, messageCount, userId]);
  },

  updateUserMessageCount: async (userId, messageCount) => {
    await pool.query('UPDATE user_xp SET message_count = ? WHERE user_id = ?', [messageCount, userId]);
  },

  getXPSettings: async () => {
    const [rows] = await pool.query('SELECT * FROM xp_settings LIMIT 1');
    return rows[0];
  },

  updateXPSettings: async (settings) => {
    await pool.query('UPDATE xp_settings SET ? WHERE id = 1', [settings]);
  },

  toggleDoubleXP: async (enabled) => {
    await pool.query('UPDATE xp_settings SET double_xp_enabled = ? WHERE id = 1', [enabled]);
  },

  getExpiredCagedUsers: async (currentTime) => {
    const [rows] = await pool.query('SELECT * FROM caged_users WHERE expires > 0 AND expires <= ?', [currentTime]);
    return rows;
  },

  removeCage: async (userId) => {
    await pool.query('DELETE FROM caged_users WHERE discord_id = ?', [userId]);
  },

  getChannelStats: async (channelId, currentDate) => {
    const [rows] = await pool.query('SELECT * FROM channel_stats WHERE channel_id = ? AND month_day = ?', [channelId, currentDate]);
    return rows;
  },

  updateChannelStats: async (channelId, currentDate) => {
    await pool.query('UPDATE channel_stats SET total = total + 1 WHERE channel_id = ? AND month_day = ?', [channelId, currentDate]);
  },

  createChannelStats: async (channelId, channelName, currentDate) => {
    await pool.query('INSERT INTO channel_stats (channel_id, channel_name, month_day, total) VALUES (?, ?, ?, 1)', [channelId, channelName, currentDate]);
  },

  createBan: async (discordId, username, reason, method, bannedById, bannedByUser, createdAt) => {
    await pool.query('INSERT INTO bans (discord_id, username, reason, method, banned_by_id, banned_by_user, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [discordId, username, reason, method, bannedById, bannedByUser, createdAt]);
  },

  createGuild: async (guildId, ownerId) => {
    await pool.query('INSERT INTO Guilds (guild_id, owner_id) VALUES (?, ?)', [guildId, ownerId]);
  },

  createGuildConfigurable: async (guildId) => {
    await pool.query('INSERT INTO GuildConfigurable (guild_id) VALUES (?)', [guildId]);
  },

  getGuildConfigurable: async (guildId) => {
    const [rows] = await pool.query('SELECT cmd_prefix FROM GuildConfigurable WHERE guild_id = ?', [guildId]);
    return rows;
  },

  deleteGuild: async (guildId) => {
    await pool.query('DELETE FROM Guilds WHERE guild_id = ?', [guildId]);
  },

  deleteGuildConfigurable: async (guildId) => {
    await pool.query('DELETE FROM GuildConfigurable WHERE guild_id = ?', [guildId]);
  },

  getAfkUser: async (userId, guildId) => {
    const [rows] = await pool.query('SELECT * FROM afk_users WHERE user_id = ? AND guild_id = ?', [userId, guildId]);
    return rows;
  },

  deleteAfkUser: async (userId, guildId) => {
    await pool.query('DELETE FROM afk_users WHERE user_id = ? AND guild_id = ?', [userId, guildId]);
  },

  insertAfkUser: async (userId, guildId, message, timestamp) => {
    await pool.query(
      'INSERT INTO afk_users (user_id, guild_id, message, timestamp) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE message = ?, timestamp = ?',
      [userId, guildId, message, timestamp, message, timestamp]
    );
  },

  getChannelStats: async (channelId, currentDate) => {
    const [rows] = await pool.query('SELECT * FROM channel_stats WHERE channel_id = ? AND month_day = ?', [channelId, currentDate]);
    return rows;
  },

  getCommand: async (commandNameHash) => {
    const [rows] = await pool.query('SELECT hash, content, `usage` FROM commands WHERE hash = ?', [commandNameHash]);
    return rows;
  },

  updateCommandUsage: async (commandNameHash, newUsageCount) => {
    await pool.query('UPDATE commands SET `usage` = ? WHERE hash = ?', [newUsageCount, commandNameHash]);
  },

  end: () => pool.end()
};