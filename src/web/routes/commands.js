const express = require("express");
const router = express.Router();
const { timestamp, getDiscordAvatarUrl } = require("../../../libs/utils");
const db = require("../../../database/db");
const crypto = require('crypto');
const config = require('../../../config');

router.get("/", (req, res) => {
	const allowed = req.session.roles.includes(config.roles.staff);
	res.render('commands', { username: req.session.user.username, avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf, allow: allowed });
});

router.get("/list", async (req, res) => {
	const query = `SELECT commands.*, 
           u1.username AS created_by_username, 
           u2.username AS updated_by_username
    FROM commands
    LEFT JOIN users u1 ON commands.created_by = u1.discord_id
    LEFT JOIN users u2 ON commands.updated_by = u2.discord_id`;

	try {
		const results = await db.sql(query);

		res.json({ commands: results });
	} catch (error) {
		console.error(error);
		res.status(400).json({ message: 'Error fetching commands', error: error.message });
	}
});

router.post("/add", async (req, res) => {
	if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}

	if (!req.session.roles || !req.session.roles.includes(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to add commands' });
	}

	const { name, content } = req.body;
	if (!name || !content) {
		return res.status(400).json({ message: 'Missing required fields' });
	}

	let hash = crypto.createHash('md5').update(name.toLowerCase()).digest('hex');
	const ts = timestamp();
	const data = [hash, name, content, req.session.user.id, req.session.user.id, ts, ts];

	try {
		await db.sql('INSERT INTO commands (hash, name, content, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', data);
		await db.bumpCustomCommandsRevision();
		res.status(201).json({ message: 'Command created' });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Internal server error', error: error.message });
	}
});

router.post("/edit/:id", async (req, res) => {
	if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}

	if (!req.session.roles || !req.session.roles.includes(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to edit commands' });
	}

	const { name, content } = req.body;
	if (!name || !content) {
		return res.status(400).json({ message: 'Missing required fields' });
	}

	let hash = crypto.createHash('md5').update(name.toLowerCase()).digest('hex');
	const data = [name, hash, content, req.session.user.id, timestamp(), req.params.id];

	try {
		await db.sql('UPDATE commands SET name = ?, hash = ?, content = ?, updated_by = ?, updated_at = ? WHERE id = ?', data);
		await db.bumpCustomCommandsRevision();
		res.status(200).json({ message: 'Command updated' });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Internal server error', error: error.message });
	}
});

router.post("/delete/:id", async(req, res) => {
	if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}

	if (!req.session.roles || !req.session.roles.includes(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to delete commands' });
	}

	try {
		await db.sql('DELETE FROM commands WHERE id = ?', [req.params.id]);
		await db.bumpCustomCommandsRevision();
		res.status(200).json({ message: 'Command deleted' });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Internal server error', error: error.message });
	}
});

router.get('/slashes', async (req, res) => {
	res.render('slashes', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf });
});

router.get('/slashes/list', async (req, res) => {
	const commandInfo = require('../../../slashCommands.json');
	res.json({ commands: commandInfo });
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff, config.roles.mod, config.roles.uploader];