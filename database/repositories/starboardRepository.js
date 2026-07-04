const db = require('../knex');
const {
  hydrateStarboardSettings,
  serializeRoleIds,
  parseJsonArray,
} = require('../../libs/starboardSettings');

function rowToPatch(settings) {
  const patch = {};
  if (settings.enabled != null) patch.starboard_enabled = Boolean(settings.enabled);
  if (settings.channelId !== undefined) patch.starboard_channel_id = settings.channelId || null;
  if (settings.emoji !== undefined) patch.starboard_emoji = settings.emoji || null;
  if (settings.threshold != null) patch.starboard_threshold = settings.threshold;
  if (settings.allowedRoleIds != null) {
    patch.starboard_allowed_role_ids = serializeRoleIds(settings.allowedRoleIds);
  }
  return patch;
}

module.exports = {
  getStarboardSettings: async (guildId) => {
    const row = await db.table('GuildConfigurable').where({ guildId: String(guildId) }).first();
    return hydrateStarboardSettings(row || {});
  },

  updateStarboardSettings: async (guildId, settings) => {
    const patch = rowToPatch(settings);
    if (!Object.keys(patch).length) return hydrateStarboardSettings({});
    await db.table('GuildConfigurable').where({ guildId: String(guildId) }).update(patch);
    return module.exports.getStarboardSettings(guildId);
  },

  getStarboardEntry: async (guildId, sourceMessageId) => {
    return db.table('starboard_entries')
      .where({
        guild_id: String(guildId),
        source_message_id: String(sourceMessageId),
      })
      .first();
  },

  upsertStarboardEntry: async (data) => {
    const guildId = String(data.guildId);
    const sourceMessageId = String(data.sourceMessageId);
    const existing = await module.exports.getStarboardEntry(guildId, sourceMessageId);
    const row = {
      guild_id: guildId,
      source_channel_id: String(data.sourceChannelId),
      source_message_id: sourceMessageId,
      starboard_message_id: String(data.starboardMessageId),
      star_count: Number(data.starCount) || 0,
      updated_at: db.fn.now(),
    };

    if (existing) {
      await db.table('starboard_entries').where({ id: existing.id }).update(row);
      return { ...existing, ...row };
    }

    const [id] = await db.table('starboard_entries').insert({
      ...row,
      created_at: db.fn.now(),
    });
    return { id, ...row };
  },

  deleteStarboardEntry: async (guildId, sourceMessageId) => {
    await db.table('starboard_entries')
      .where({
        guild_id: String(guildId),
        source_message_id: String(sourceMessageId),
      })
      .delete();
  },

  parseAllowedRoleIdsFromRow: parseJsonArray,

  getStarboardSettingDefinitions: () => require('../../libs/starboardSettings').getStarboardSettingDefinitions(),

  parseStarboardSettingsInput: (...args) => require('../../libs/starboardSettings').parseStarboardSettingsInput(...args),
};
