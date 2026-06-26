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
    ...extra,
  };
}

async function buildPageState(req, extra = {}) {
  const rulesText = extra.rulesText ?? await db.exportScamScanRulesText();
  const parsed = db.parseScamScanRulesText(rulesText);
  return baseView(req, {
    rulesText,
    ruleCount: parsed.rules.length,
    errors: [],
    success: '',
    testText: '',
    testMatches: null,
    ...extra,
  });
}

function validateCsrf(req, res) {
  if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
    res.status(403);
    return false;
  }
  return true;
}

router.get('/', async (req, res, next) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    res.render('scamScanRules', await buildPageState(req));
  } catch (e) {
    next(e);
  }
});

router.post('/save', async (req, res, next) => {
  try {
    if (!validateCsrf(req, res)) {
      return res.render('scamScanRules', await buildPageState(req, {
        rulesText: String(req.body.rules || ''),
        errors: ['Invalid CSRF token.'],
      }));
    }
    if (!canEdit(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

    const rulesText = String(req.body.rules || '');
    const result = await db.replaceScamScanKeywordRulesFromText({
      text: rulesText,
      userId: req.session.user.id,
    });
    if (!result.ok) {
      return res.status(400).render('scamScanRules', await buildPageState(req, {
        rulesText,
        errors: result.errors,
        ruleCount: result.rules.length,
      }));
    }
    return res.render('scamScanRules', await buildPageState(req, {
      rulesText: await db.exportScamScanRulesText(),
      ruleCount: result.rules.length,
      success: `Saved ${result.rules.length} scam scan keyword rule(s).`,
    }));
  } catch (e) {
    next(e);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    if (!validateCsrf(req, res)) {
      return res.status(403).render('scamScanRules', await buildPageState(req, {
        rulesText: String(req.body.rules || ''),
        testText: String(req.body.test_text || ''),
        errors: ['Invalid CSRF token.'],
      }));
    }
    if (!canEdit(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

    const testText = String(req.body.test_text || '').slice(0, 5000);
    const rulesText = await db.exportScamScanRulesText();
    const parsed = db.parseScamScanRulesText(rulesText);
    const testMatches = await db.testScamScanRulesAgainstText(testText);
    return res.render('scamScanRules', await buildPageState(req, {
      rulesText,
      ruleCount: parsed.rules.length,
      errors: [],
      testText,
      testMatches,
    }));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff];
