const express = require("express");
const router = express.Router();
const { timestamp, getDiscordAvatarUrl, generateUniqueId} = require("../libs/utils");
const db = require("../../database/db");
const crypto = require('crypto');
const config = require('../../.config');

router.get("/", (req, res) => {
	const allowed = req.session.roles.includes(config.roles.staff);
	res.render('warnings', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf, allow: allowed });
});

router.get("/list", async (req, res) => {
	const results = await db.query(`SELECT * FROM warnings`);
	const formattedResults = results.map(command => ({
		...command,
		created_at: new Date(command.created_at * 1000).toLocaleString(),
		updated_at: new Date(command.updated_at * 1000).toLocaleString(),
	}));

	res.json({ warnings: formattedResults });
});

router.post("/add", async (req, res) => {
	if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}
	if (!hasRole(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to add warnings' });
	}

	const { warn_user_id, warn_user, warn_reason } = req.body;
	if (!reason ) {
		return res.status(400).json({ message: 'Missing required fields' });
	}

	let data = [];
	data.push(generateUniqueId());  // warn_id
	data.push(warn_user_id);        // warn_user_id
	data.push(warn_user);           // warn_user
	data.push(req.session.user.id); // warn_by_id
	data.push(req.session.user.username); // warn_by_user
	data.push(warn_reason);         // warn_reason
	data.push(timestamp());         // created_at
	data.push(timestamp());         // updated_at

	try {
		await db.query('INSERT INTO warnings (warn_id, warn_user_id, warn_user, warn_by_id, warn_by_user, warn_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', data);
		res.status(201).json({ message: 'Warning created' });
	} catch (error) {
		console.error(error);
		res.status(400).json({ message: 'Error creating warning', error: error.message });
	}
});

router.post("/edit/:id", async (req, res) => {
	if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}
	if (!hasRole(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to edit warnings' });
	}

	const { reason } = req.body;
	if (!reason) {
		return res.status(400).json({ message: 'Missing required fields' });
	}

	try {
		await db.query('UPDATE warnings SET warn_reason = ?, updated_at = ? WHERE warn_id = ?', [reason, timestamp(), req.params.id]);
		res.status(200).json({ message: 'Warning updated' });
	} catch (error) {
		console.error(error);
		res.status(400).json({ message: 'Error updating warning', error: error.message });
	}
});

router.post("/delete/:id", async (req, res) => {
    if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
        return res.status(403).json({ message: 'Invalid CSRF token' });
    }
	if (!hasRole(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to delete warnings' });
	}

    try {
        await db.query("DELETE FROM warnings WHERE warn_id = ?", [req.params.id]);
        res.status(200).json({ message: 'Warning deleted' });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Error deleting warning', error: error.message });
    }
});


module.exports = {
	router: router,
	requiredRoles: [config.roles.staff, config.roles.mod, config.roles.uploader]
};