const db = require('../knex');

/**
 * Guild records and guild-scoped configuration. Tables: Guilds, GuildConfigurable.
 * Behavior and return shapes preserved verbatim from the original database/db.js.
 */
module.exports = {
  createGuild: async (guildId, ownerId) => {
    // Column is `guildOwnerId` in the migration, snapshot, and production schema (not `owner_id`).
    await db.table('Guilds').insert({ guildId: guildId, guildOwnerId: ownerId });
  },

  deleteGuild: async (guildId) => {
    await db.table('Guilds').where({ guildId: guildId }).delete();
  },

  createGuildConfigurable: async (guildId) => {
    await db.table('GuildConfigurable').insert({ guildId: guildId });
  },

  deleteGuildConfigurable: async (guildId) => {
    await db.table('GuildConfigurable').where({ guildId: guildId }).delete();
  },

  getGuildConfigurable: async (guildId) => {
    const [rows] = await db.table('GuildConfigurable').select('*').where({ guildId: guildId });
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
};
