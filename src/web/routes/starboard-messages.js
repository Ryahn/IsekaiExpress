const express = require('express');
const router = express.Router();
const db = require('../../../database/db');
const config = require('../../../config');
const requireCsrf = require('../middleware/requireCsrf');
const { rest, canManageStarboard } = require('../utils/starboardAccess');
const { removeStarboardEntry } = require('../../../libs/starboardRemoval');

router.use(requireCsrf);

const ENTRY_ID_PATTERN = /^\d+$/;

function formatTimestamp(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function buildChannelNameMap(channels) {
  const map = new Map();
  for (const ch of channels || []) {
    map.set(String(ch.id), ch.name || String(ch.id));
  }
  return map;
}

function formatEntryRow(entry, guildId, settings, channelNames) {
  const sourceChannelId = String(entry.source_channel_id);
  const sourceMessageId = String(entry.source_message_id);
  const starboardChannelId = settings.channelId ? String(settings.channelId) : '';
  const starboardMessageId = String(entry.starboard_message_id);

  return {
    id: entry.id,
    star_count: Number(entry.star_count) || 0,
    source_channel_id: sourceChannelId,
    source_channel_name: channelNames.get(sourceChannelId) || sourceChannelId,
    source_message_id: sourceMessageId,
    source_message_url: `https://discord.com/channels/${guildId}/${sourceChannelId}/${sourceMessageId}`,
    starboard_message_id: starboardMessageId,
    starboard_message_url: starboardChannelId
      ? `https://discord.com/channels/${guildId}/${starboardChannelId}/${starboardMessageId}`
      : null,
    created_at: formatTimestamp(entry.created_at),
    updated_at: formatTimestamp(entry.updated_at),
  };
}

async function fetchGuildChannels() {
  const { Routes } = require('discord-api-types/v10');
  const channels = await rest.get(Routes.guildChannels(config.discord.guildId));
  return Array.isArray(channels) ? channels : [];
}

router.get('/', async (req, res, next) => {
  try {
    const settings = await db.getStarboardSettings(config.discord.guildId);
    if (!(await canManageStarboard(req, settings))) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    return res.redirect(302, '/starboard-settings');
  } catch (e) {
    next(e);
  }
});

router.get('/list', async (req, res, next) => {
  try {
    const settings = await db.getStarboardSettings(config.discord.guildId);
    if (!(await canManageStarboard(req, settings))) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const [entries, channels] = await Promise.all([
      db.listStarboardEntries(config.discord.guildId),
      fetchGuildChannels().catch(() => []),
    ]);
    const channelNames = buildChannelNameMap(channels);
    const guildId = String(config.discord.guildId);

    res.json({
      entries: (entries || []).map((entry) => formatEntryRow(entry, guildId, settings, channelNames)),
      starboardChannelId: settings.channelId || '',
    });
  } catch (e) {
    next(e);
  }
});

router.post('/delete/:id', async (req, res, next) => {
  try {
    const settings = await db.getStarboardSettings(config.discord.guildId);
    if (!(await canManageStarboard(req, settings))) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    if (!req.session?.csrf || req.session.csrf !== req.body?._csrf) {
      return res.status(403).json({ message: 'Invalid CSRF token.' });
    }

    const entryId = String(req.params.id || '').trim();
    if (!ENTRY_ID_PATTERN.test(entryId)) {
      return res.status(400).json({ message: 'Invalid starboard entry id.' });
    }

    const entry = await db.getStarboardEntryById(entryId);
    if (!entry) {
      return res.status(404).json({ message: 'Starboard entry not found.' });
    }

    const result = await removeStarboardEntry(db, rest, config.discord.guildId, entry, settings);
    if (!result.ok) {
      return res.status(400).json({ message: result.error || 'Could not remove starboard entry.' });
    }

    return res.json({ message: 'Removed message from the starboard channel.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.requiredRoles = [];
