const express = require('express');
const { Routes } = require('discord-api-types/v10');
const router = express.Router();
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const db = require('../../../database/db');
const config = require('../../../config');
const requireCsrf = require('../middleware/requireCsrf');
const { rest, canManageStarboard } = require('../utils/starboardAccess');
const {
  getStarboardSettingDefinitions,
  validateEnableSettings,
  THRESHOLD_MIN,
  THRESHOLD_MAX,
} = require('../../../libs/starboardSettings');

router.use(requireCsrf);

function wantsJson(req) {
  const accept = typeof req.get === 'function' ? req.get('accept') : req.headers?.accept;
  return req.xhr || String(accept || '').includes('application/json');
}

function hasValidCsrf(req) {
  return Boolean(req.session?.csrf && req.session.csrf === req.body?._csrf);
}

async function fetchGuildRoles() {
  const roles = await rest.get(Routes.guildRoles(config.discord.guildId));
  return (Array.isArray(roles) ? roles : [])
    .filter((role) => role.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name, color: role.color }));
}

async function fetchGuildChannels() {
  const channels = await rest.get(Routes.guildChannels(config.discord.guildId));
  return Array.isArray(channels) ? channels : [];
}

const STARBOARD_CHANNEL_TYPES = new Set([0, 5, 15, 16]);

async function fetchTextChannels(configuredChannelId) {
  const all = await fetchGuildChannels().catch(() => []);
  const textChannels = all
    .filter((ch) => STARBOARD_CHANNEL_TYPES.has(ch.type))
    .map((ch) => ({ id: String(ch.id), name: ch.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (configuredChannelId) {
    const id = String(configuredChannelId);
    if (!textChannels.some((ch) => ch.id === id)) {
      const match = all.find((ch) => String(ch.id) === id);
      textChannels.push({ id, name: match?.name || `Channel ${id}` });
      textChannels.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return textChannels;
}

function normalizeSettingsForPanel(settings = {}) {
  return {
    ...settings,
    enabled: Boolean(settings.enabled),
    channelId: settings.channelId ? String(settings.channelId) : '',
    emoji: settings.emoji || '',
    threshold: Number(settings.threshold) || 3,
    allowedRoleIds: Array.isArray(settings.allowedRoleIds) ? settings.allowedRoleIds.map(String) : [],
    adminRoleIds: Array.isArray(settings.adminRoleIds) ? settings.adminRoleIds.map(String) : [],
  };
}

function baseView(req, extra = {}) {
  return {
    username: req.session.user.username,
    avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar),
    csrfToken: req.session.csrf,
    definitions: getStarboardSettingDefinitions(),
    thresholdMin: THRESHOLD_MIN,
    thresholdMax: THRESHOLD_MAX,
    errors: [],
    success: '',
    ...extra,
  };
}

async function buildPageState(req, extra = {}) {
  const rawSettings = extra.settings || await db.getStarboardSettings(config.discord.guildId);
  const settings = normalizeSettingsForPanel(rawSettings);
  const [guildRoles, textChannels] = await Promise.all([
    fetchGuildRoles().catch(() => []),
    fetchTextChannels(settings.channelId).catch(() => []),
  ]);
  const state = baseView(req, { settings, guildRoles, textChannels, ...extra });
  return {
    ...state,
    alpineStateJson: JSON.stringify({
      csrfToken: state.csrfToken,
      settings: state.settings || {},
      guildRoles: state.guildRoles || [],
      textChannels: state.textChannels || [],
      success: state.success || '',
      errors: state.errors || [],
      thresholdMin: state.thresholdMin,
      thresholdMax: state.thresholdMax,
    }).replace(/</g, '\\u003c'),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const settings = await db.getStarboardSettings(config.discord.guildId);
    if (!(await canManageStarboard(req, settings))) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    const state = await buildPageState(req, { settings });
    if (wantsJson(req)) {
      return res.json({
        settings: state.settings,
        guildRoles: state.guildRoles,
        textChannels: state.textChannels,
        definitions: state.definitions,
      });
    }
    return res.render('starboardSettings', state);
  } catch (e) {
    next(e);
  }
});

router.post('/save', async (req, res, next) => {
  try {
    const currentSettings = await db.getStarboardSettings(config.discord.guildId);
    if (!(await canManageStarboard(req, currentSettings))) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    if (!hasValidCsrf(req)) {
      const state = await buildPageState(req, { settings: currentSettings, errors: ['Invalid CSRF token.'] });
      if (wantsJson(req)) {
        return res.status(403).json({ message: 'Invalid CSRF token.', errors: state.errors, settings: state.settings });
      }
      return res.status(403).render('starboardSettings', state);
    }

    const allowedRoleIds = Array.isArray(req.body.allowedRoleIds)
      ? req.body.allowedRoleIds
      : typeof req.body.allowedRoleIds === 'string' && req.body.allowedRoleIds
        ? req.body.allowedRoleIds.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

    const adminRoleIds = Array.isArray(req.body.adminRoleIds)
      ? req.body.adminRoleIds
      : typeof req.body.adminRoleIds === 'string' && req.body.adminRoleIds
        ? req.body.adminRoleIds.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

    const parsed = db.parseStarboardSettingsInput(
      {
        enabled: req.body.enabled,
        channelId: req.body.channelId,
        emoji: req.body.emoji,
        threshold: req.body.threshold,
        allowedRoleIds,
        adminRoleIds,
      },
      { checkboxInput: true },
    );

    if (!parsed.ok) {
      const state = await buildPageState(req, { settings: parsed.settings, errors: parsed.errors });
      if (wantsJson(req)) {
        return res.status(400).json({ message: 'Could not save settings.', errors: state.errors, settings: state.settings });
      }
      return res.status(400).render('starboardSettings', state);
    }

    if (parsed.settings.enabled) {
      const enableErrors = validateEnableSettings(parsed.settings);
      if (enableErrors.length) {
        const state = await buildPageState(req, { settings: parsed.settings, errors: enableErrors });
        if (wantsJson(req)) {
          return res.status(400).json({ message: 'Could not save settings.', errors: state.errors, settings: state.settings });
        }
        return res.status(400).render('starboardSettings', state);
      }
    }

    const saved = await db.updateStarboardSettings(config.discord.guildId, parsed.settings);
    const state = await buildPageState(req, { settings: saved, success: 'Saved starboard settings.' });

    if (wantsJson(req)) {
      return res.json({ message: state.success, settings: state.settings });
    }
    return res.render('starboardSettings', state);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.requiredRoles = [];
