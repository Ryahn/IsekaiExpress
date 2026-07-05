const express = require('express');
const router = express.Router();
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const db = require('../../../database/db');
const config = require('../../../config');
const requireCsrf = require('../middleware/requireCsrf');
const { hasStaffRole, hasModOrStaffRole } = require('../utils/roleAccess');
router.use(requireCsrf);

function canView(req) {
	return hasModOrStaffRole(req.session);
}

function canEdit(req) {
	return hasStaffRole(req.session);
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
		definitions: db.getScamScanSettingDefinitions(),
		errors: [],
		success: '',
		...extra,
	};
}

function hasValidCsrf(req) {
	return Boolean(req.session?.csrf && req.session.csrf === req.body?._csrf);
}

async function buildPageState(req, extra = {}) {
	const settings = extra.settings || await db.getScamScanSettings();
	const state = baseView(req, { settings, ...extra });
	return {
		...state,
		settingsJson: JSON.stringify(state.settings || {}),
		errorsJson: JSON.stringify(state.errors || []),
		successJson: JSON.stringify(state.success || ''),
		alpineStateJson: JSON.stringify({
			csrfToken: state.csrfToken,
			settings: state.settings || {},
			success: state.success || '',
			errors: state.errors || [],
		}).replace(/</g, '\\u003c'),
	};
}

router.get('/', async (req, res, next) => {
	try {
		if (!canView(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
		const state = await buildPageState(req);
		if (wantsJson(req)) {
			return res.json({
				settings: state.settings,
				definitions: state.definitions,
			});
		}
		return res.render('scamScanSettings', state);
	}
	catch (e) {
		next(e);
	}
});

router.post('/save', async (req, res, next) => {
	try {
		if (!hasValidCsrf(req)) {
			const state = await buildPageState(req, {
				errors: ['Invalid CSRF token.'],
			});
			if (wantsJson(req)) {
				return res.status(403).json({ message: 'Invalid CSRF token.', errors: state.errors, settings: state.settings });
			}
			return res.status(403).render('scamScanSettings', state);
		}
		const parsed = db.parseScamScanSettingsInput(req.body, { checkboxInput: true });
		if (!canEdit(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

		if (!parsed.ok) {
			const state = await buildPageState(req, {
				settings: parsed.settings,
				errors: parsed.errors,
			});
			if (wantsJson(req)) {
				return res.status(400).json({ message: 'Could not save settings.', errors: state.errors, settings: state.settings });
			}
			return res.status(400).render('scamScanSettings', state);
		}

		const saved = await db.replaceScamScanSettings({
			settings: parsed.settings,
			userId: req.session.user.id,
		});
		if (!saved.ok) {
			const state = await buildPageState(req, {
				settings: saved.settings,
				errors: saved.errors,
			});
			if (wantsJson(req)) {
				return res.status(400).json({ message: 'Could not save settings.', errors: state.errors, settings: state.settings });
			}
			return res.status(400).render('scamScanSettings', state);
		}

		const state = await buildPageState(req, {
			settings: saved.settings,
			success: 'Saved scam scan settings.',
		});
		if (wantsJson(req)) {
			return res.json({
				message: state.success,
				settings: state.settings,
			});
		}
		return res.render('scamScanSettings', state);
	}
	catch (e) {
		next(e);
	}
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff, config.roles.mod];
