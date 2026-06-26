const express = require('express');
const router = express.Router();
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const db = require('../../../database/db');
const config = require('../../../config');

function canEdit(req) {
	return Boolean(req.session?.roles?.includes(config.roles.staff));
}

function wantsJson(req) {
	const accept = typeof req.get === 'function' ? req.get('accept') : req.headers?.accept;
	return req.xhr || String(accept || '').includes('application/json');
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
	const state = baseView(req, {
		rulesText,
		ruleCount: parsed.rules.length,
		errors: [],
		success: '',
		testText: '',
		testMatches: null,
		...extra,
	});
	return {
		...state,
		rulesTextJson: JSON.stringify(state.rulesText),
		errorsJson: JSON.stringify(state.errors || []),
		successJson: JSON.stringify(state.success || ''),
		testTextJson: JSON.stringify(state.testText || ''),
		testMatchesJson: JSON.stringify(state.testMatches),
		alpineStateJson: JSON.stringify({
			csrfToken: state.csrfToken,
			rulesText: state.rulesText,
			ruleCount: state.ruleCount,
			testText: state.testText,
			testMatches: state.testMatches,
			success: state.success || '',
			errors: state.errors || [],
		}).replace(/</g, '\\u003c'),
	};
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
		const state = await buildPageState(req);
		if (wantsJson(req)) {
			return res.json({
				rulesText: state.rulesText,
				ruleCount: state.ruleCount,
				testText: state.testText,
				testMatches: state.testMatches,
			});
		}
		return res.render('scamScanRules', state);
	}
	catch (e) {
		next(e);
	}
});

router.post('/save', async (req, res, next) => {
	try {
		if (!validateCsrf(req, res)) {
			const state = await buildPageState(req, {
				rulesText: String(req.body.rules || ''),
				errors: ['Invalid CSRF token.'],
			});
			if (wantsJson(req)) {
				return res.status(403).json({ message: 'Invalid CSRF token.', errors: state.errors, rulesText: state.rulesText, ruleCount: state.ruleCount });
			}
			return res.render('scamScanRules', state);
		}
		if (!canEdit(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

		const rulesText = String(req.body.rules || '');
		const result = await db.replaceScamScanKeywordRulesFromText({
			text: rulesText,
			userId: req.session.user.id,
		});
		if (!result.ok) {
			const state = await buildPageState(req, {
				rulesText,
				errors: result.errors,
				ruleCount: result.rules.length,
			});
			if (wantsJson(req)) {
				return res.status(400).json({ message: 'Could not save rules.', errors: state.errors, rulesText: state.rulesText, ruleCount: state.ruleCount });
			}
			return res.status(400).render('scamScanRules', state);
		}
		const state = await buildPageState(req, {
			rulesText: await db.exportScamScanRulesText(),
			ruleCount: result.rules.length,
			success: `Saved ${result.rules.length} scam scan keyword rule(s).`,
		});
		if (wantsJson(req)) {
			return res.json({
				message: state.success,
				rulesText: state.rulesText,
				ruleCount: state.ruleCount,
			});
		}
		return res.render('scamScanRules', state);
	}
	catch (e) {
		next(e);
	}
});

router.post('/test', async (req, res, next) => {
	try {
		if (!validateCsrf(req, res)) {
			const state = await buildPageState(req, {
				rulesText: String(req.body.rules || ''),
				testText: String(req.body.test_text || ''),
				errors: ['Invalid CSRF token.'],
			});
			if (wantsJson(req)) {
				return res.status(403).json({ message: 'Invalid CSRF token.', errors: state.errors });
			}
			return res.status(403).render('scamScanRules', state);
		}
		if (!canEdit(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

		const testText = String(req.body.test_text || '').slice(0, 5000);
		const rulesText = await db.exportScamScanRulesText();
		const parsed = db.parseScamScanRulesText(rulesText);
		const testMatches = await db.testScamScanRulesAgainstText(testText);
		const state = await buildPageState(req, {
			rulesText,
			ruleCount: parsed.rules.length,
			errors: [],
			testText,
			testMatches,
		});
		if (wantsJson(req)) {
			return res.json({
				rulesText: state.rulesText,
				ruleCount: state.ruleCount,
				testText: state.testText,
				testMatches: state.testMatches,
			});
		}
		return res.render('scamScanRules', state);
	}
	catch (e) {
		next(e);
	}
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff];
