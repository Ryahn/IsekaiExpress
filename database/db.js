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

  end: () => pool.end()
};