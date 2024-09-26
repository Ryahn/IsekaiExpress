const express = require("express");
require("dotenv").config();
const router = express.Router();
const { timestamp, getDiscordAvatarUrl, hasRole } = require("../libs/utils");
const db = require("../libs/database/db");
const crypto = require('crypto');

router.get("/", (req, res) => {
	res.render('commands', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf });
});

router.get("/list", async (req, res) => {
	const query = `SELECT commands.*, 
           u1.username AS created_by_username, 
           u2.username AS updated_by_username
    FROM commands
    LEFT JOIN users u1 ON commands.created_by = u1.discord_id
    LEFT JOIN users u2 ON commands.updated_by = u2.discord_id`;

	try {
		const results = await db.query(query);

		const formattedResults = results.map(command => ({
			...command,
			created_at: new Date(command.created_at * 1000).toLocaleString(),
			updated_at: new Date(command.updated_at * 1000).toLocaleString(),
		}));

		res.json({ commands: formattedResults });
	} catch (error) {
		console.error(error);
		res.status(400).json({ message: 'Error fetching commands', error: error.message });
	}
});

router.post("/add", async (req, res) => {
	if (!req.session.csrf || req.session.csrf !== req.body._csrf) {
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}

	if (!hasRole(process.env.DISCORD_STAFF_ROLE_ID)) {
		return res.status(403).json({ message: 'You do not have permission to add commands' });
	}

	const { name, content } = req.body;
	if (!name || !content) {
		return res.status(400).json({ message: 'Missing required fields' });
	}

	let hash = crypto.createHash('md5').update(name.toLowerCase()).digest('hex');
	let data = [
		hash,
		name,
		content,
		created_by = req.session.user.id,
		updated_by = req.session.user.id,
		created_at = timestamp(),
		update_at = timestamp(),
	];

	try {
		await db.query('INSERT INTO commands (hash, name, content, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', data);
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

	if (!hasRole(process.env.DISCORD_STAFF_ROLE_ID)) {
		return res.status(403).json({ message: 'You do not have permission to edit commands' });
	}

	const { name, content } = req.body;
	if (!name || !content) {
		return res.status(400).json({ message: 'Missing required fields' });
	}

	let hash = crypto.createHash('md5').update(name.toLowerCase()).digest('hex');
	let data = [
		name,
		hash,
		content,
		updated_by = req.session.user.id,
		updated_at = timestamp(),
		id = req.params.id,
	];

	try {
		await db.query('UPDATE commands SET name = ?, hash = ?, content = ?, updated_by = ?, updated_at = ? WHERE id = ?', data);
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

	if (!hasRole(process.env.DISCORD_STAFF_ROLE_ID)) {
		return res.status(403).json({ message: 'You do not have permission to delete commands' });
	}

	try {
		await db.query('DELETE FROM commands WHERE id = ?', [req.params.id]);
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
	const commandInfo = require('../../slashCommands.json');
	res.json({ commands: commandInfo });
});

module.exports = router;