const express = require("express");
const router = express.Router();
const { timestamp, getDiscordAvatarUrl, generateUniqueId} = require("../../../libs/utils");
const db = require("../../../database/db");
const crypto = require('crypto');
const config = require('../../../config');
const requireCsrf = require('../middleware/requireCsrf');
const { hasStaffRole } = require('../utils/roleAccess');
router.use(requireCsrf);
const WARNING_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const DISCORD_USER_ID_PATTERN = /^\d{17,20}$/;
const WARNING_USERNAME_MAX_LENGTH = 100;
const WARNING_REASON_MAX_LENGTH = 2000;

function validateWarningId(id) {
	return WARNING_ID_PATTERN.test(String(id || ''));
}

function parseWarningCreateInput(body) {
	const warnUserId = String(body.warn_user_id || '').trim();
	const warnUser = String(body.warn_user || '').trim();
	const warnReason = String(body.warn_reason || '').trim();

	if (!DISCORD_USER_ID_PATTERN.test(warnUserId)) {
		return { ok: false, message: 'Invalid Discord user ID' };
	}
	if (!warnUser || warnUser.length > WARNING_USERNAME_MAX_LENGTH) {
		return { ok: false, message: 'Warning username must be 1-100 characters.' };
	}
	if (!warnReason || warnReason.length > WARNING_REASON_MAX_LENGTH) {
		return { ok: false, message: 'Warning reason must be 1-2000 characters.' };
	}

	return { ok: true, warnUserId, warnUser, warnReason };
}

function parseWarningReason(body) {
	const reason = String(body.reason || '').trim();
	if (!reason || reason.length > WARNING_REASON_MAX_LENGTH) {
		return { ok: false, message: 'Warning reason must be 1-2000 characters.' };
	}
	return { ok: true, reason };
}

router.get("/", (req, res) => {
	const allowed = hasStaffRole(req.session);
	res.render('warnings', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf, allow: allowed });
});

router.get("/list", async (req, res) => {
	const results = await db.sql(`SELECT * FROM warnings`);
	const formattedResults = results.map(command => ({
		...command,
		created_at: new Date(command.created_at * 1000).toLocaleString(),
		updated_at: new Date(command.updated_at * 1000).toLocaleString(),
	}));

	res.json({ warnings: formattedResults });
});

router.post("/add", async (req, res) => {
	if (!hasStaffRole(req.session)) {
		return res.status(403).json({ message: 'You do not have permission to add warnings' });
	}

	const parsed = parseWarningCreateInput(req.body);
	if (!parsed.ok) {
		return res.status(400).json({ message: parsed.message });
	}

	let data = [];
	data.push(generateUniqueId());  // warn_id
	data.push(parsed.warnUserId);   // warn_user_id
	data.push(parsed.warnUser);     // warn_user
	data.push(req.session.user.id); // warn_by_id
	data.push(req.session.user.username); // warn_by_user
	data.push(parsed.warnReason);   // warn_reason
	data.push(timestamp());         // created_at
	data.push(timestamp());         // updated_at

	try {
		await db.sql('INSERT INTO warnings (warn_id, warn_user_id, warn_user, warn_by_id, warn_by_user, warn_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', data);
		res.status(201).json({ message: 'Warning created' });
	} catch (error) {
		console.error(error);
		res.status(400).json({ message: 'Error creating warning' });
	}
});

router.post("/edit/:id", async (req, res) => {
	if (!hasStaffRole(req.session)) {
		return res.status(403).json({ message: 'You do not have permission to edit warnings' });
	}
	if (!validateWarningId(req.params.id)) {
		return res.status(400).json({ message: 'Invalid warning id' });
	}
	const parsed = parseWarningReason(req.body);
	if (!parsed.ok) {
		return res.status(400).json({ message: parsed.message });
	}

	try {
		await db.sql('UPDATE warnings SET warn_reason = ?, updated_at = ? WHERE warn_id = ?', [parsed.reason, timestamp(), req.params.id]);
		res.status(200).json({ message: 'Warning updated' });
	} catch (error) {
		console.error(error);
		res.status(400).json({ message: 'Error updating warning' });
	}
});

router.post("/delete/:id", async (req, res) => {
	if (!hasStaffRole(req.session)) {
		return res.status(403).json({ message: 'You do not have permission to delete warnings' });
	}
	if (!validateWarningId(req.params.id)) {
		return res.status(400).json({ message: 'Invalid warning id' });
	}

    try {
        await db.sql("DELETE FROM warnings WHERE warn_id = ?", [req.params.id]);
        res.status(200).json({ message: 'Warning deleted' });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Error deleting warning' });
    }
});


module.exports = router;
module.exports.requiredRoles = [config.roles.staff, config.roles.mod];