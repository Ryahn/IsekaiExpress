const express = require('express');
const router = express.Router();
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const db = require('../../../database/db');
const config = require('../../../config');

function canEdit(req) {
  return Boolean(req.session?.roles?.includes(config.roles.staff));
}

function baseView(req, extra = {}) {
  return {
    username: req.session.user.username,
    avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar),
    csrfToken: req.session.csrf,
    definitions: db.getScamScanSettingDefinitions(),
    errors: [],
    success: '',
    ...extra,
  };
}

function validateCsrf(req, res) {
  if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
    res.status(403);
    return false;
  }
  return true;
}

async function buildPageState(req, extra = {}) {
  const settings = extra.settings || await db.getScamScanSettings();
  return baseView(req, { settings, ...extra });
}

router.get('/', async (req, res, next) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    return res.render('scamScanSettings', await buildPageState(req));
  } catch (e) {
    next(e);
  }
});

router.post('/save', async (req, res, next) => {
  try {
    const parsed = db.parseScamScanSettingsInput(req.body, { checkboxInput: true });
    if (!validateCsrf(req, res)) {
      return res.render('scamScanSettings', await buildPageState(req, {
        settings: parsed.settings,
        errors: ['Invalid CSRF token.'],
      }));
    }
    if (!canEdit(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

    if (!parsed.ok) {
      return res.status(400).render('scamScanSettings', await buildPageState(req, {
        settings: parsed.settings,
        errors: parsed.errors,
      }));
    }

    const saved = await db.replaceScamScanSettings({
      settings: parsed.settings,
      userId: req.session.user.id,
    });
    if (!saved.ok) {
      return res.status(400).render('scamScanSettings', await buildPageState(req, {
        settings: saved.settings,
        errors: saved.errors,
      }));
    }

    return res.render('scamScanSettings', await buildPageState(req, {
      settings: saved.settings,
      success: 'Saved scam scan settings.',
    }));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff];
