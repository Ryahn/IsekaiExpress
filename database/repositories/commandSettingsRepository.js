const db = require('../knex');

/** Match the original db.js nowUnix helper used by createCommandSettings. */
const nowUnix = () => Math.floor(Date.now() / 1000);

/**
 * Command channel settings + custom command content + app_state revision tracking.
 * Tables: command_settings, commands, app_state.
 * Behavior and return shapes preserved verbatim from the original database/db.js.
 */
const self = (module.exports = {
  createCommandSettings: async (name, hash, category = 'misc', channelId = '351435045921357824') => {
    await db.table('command_settings').insert({ name: name, hash: hash, channel_id: channelId, category: category, created_at: nowUnix(), updated_at: nowUnix() }).onConflict('hash').ignore();
  },

  getAllowedChannel: async (hash) => {
    const [rows] = await db.table('command_settings').select('channel_id').where({ hash: hash });
    return rows;
  },

  getCommandSettingsByHash: async (hash) => {
    const [rows] = await db.table('command_settings').select('*').where({ hash: hash });
    return rows;
  },

  getCommandSettings: async (itemsPerPage = 10, offset = 0) => {
    const rows = await db.table('command_settings').select('*').orderBy('name', 'asc').limit(itemsPerPage).offset(offset);
    return rows;
  },

  updateCommandSettings: async (hash, channelId) => {
    await db.table('command_settings').update({ channel_id: channelId }).where({ hash: hash });
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
});
