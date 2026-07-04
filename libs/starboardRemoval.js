const { Routes } = require('discord-api-types/v10');

/**
 * Delete a starboard post from Discord. Ignores unknown message / missing access errors.
 */
async function deleteStarboardDiscordMessage(rest, channelId, messageId) {
  if (!channelId || !messageId) return { ok: false, reason: 'missing channel or message id' };
  try {
    await rest.delete(Routes.channelMessage(String(channelId), String(messageId)));
    return { ok: true };
  } catch (error) {
    const status = error?.status ?? error?.code;
    if (status === 404 || status === 10008) {
      return { ok: true, reason: 'message already deleted' };
    }
    throw error;
  }
}

/**
 * Remove a starboard entry from Discord and the database.
 */
async function removeStarboardEntry(db, rest, guildId, entry, settings) {
  if (!entry) {
    return { ok: false, error: 'Starboard entry not found.' };
  }
  if (String(entry.guild_id) !== String(guildId)) {
    return { ok: false, error: 'Starboard entry does not belong to this server.' };
  }

  const channelId = settings?.channelId || null;
  await deleteStarboardDiscordMessage(rest, channelId, entry.starboard_message_id);
  await db.deleteStarboardEntryById(entry.id);

  return { ok: true };
}

module.exports = {
  deleteStarboardDiscordMessage,
  removeStarboardEntry,
};
