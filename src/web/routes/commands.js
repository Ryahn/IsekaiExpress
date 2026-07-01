const express = require("express");
const router = express.Router();
const fs = require('node:fs');
const path = require('node:path');
const { getDiscordAvatarUrl } = require("../../../libs/utils");
const db = require("../../../database/db");
const config = require('../../../config');
const requireCsrf = require('../middleware/requireCsrf');
router.use(requireCsrf);

const slashCommandsPath = path.join(__dirname, '../../bot/commands/slashCommands');
const COMMAND_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COMMAND_CONTENT_MAX_LENGTH = 4000;
const COMMAND_ID_PATTERN = /^\d+$/;

function parseCommandInput(body) {
	const name = String(body.name || '').trim();
	const content = String(body.content || '').trim();
	if (!COMMAND_NAME_PATTERN.test(name)) {
		return {
			ok: false,
			message: 'Command name must be 1-64 characters and contain only letters, numbers, underscores, or hyphens.',
		};
	}
	if (!content || content.length > COMMAND_CONTENT_MAX_LENGTH) {
		return { ok: false, message: 'Command content must be 1-4000 characters.' };
	}
	return { ok: true, name, content };
}

function validateCommandId(id) {
	return COMMAND_ID_PATTERN.test(String(id || ''));
}

function getSlashCommandFiles(dir) {
	if (!fs.existsSync(dir)) {
		return [];
	}

	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			return entry.name === 'handlers' ? [] : getSlashCommandFiles(entryPath);
		}

		return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
	});
}

async function getSlashCommands() {
	const commands = [];

	for (const file of getSlashCommandFiles(slashCommandsPath)) {
		try {
			const command = require(file);
			const commandData = typeof command.data === 'function' ? await command.data() : command.data;
			if (!commandData || typeof commandData.toJSON !== 'function') {
				continue;
			}

			const { name, description } = commandData.toJSON();
			commands.push({ name, description });
		} catch (error) {
			console.error(`Failed to load slash command metadata from ${file}:`, error);
		}
	}

	return commands;
}

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
		res.status(400).json({ message: 'Error fetching commands' });
	}
});

router.post("/add", async (req, res) => {
	if (!req.session.roles || !req.session.roles.includes(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to add commands' });
	}

	const parsed = parseCommandInput(req.body);
	if (!parsed.ok) {
		return res.status(400).json({ message: parsed.message });
	}
	try {
		const result = await db.createCustomCommand({
			name: parsed.name,
			content: parsed.content,
			userId: req.session.user.id,
		});
		if (!result.ok) {
			return res.status(400).json({ message: result.message || 'Could not create command' });
		}
		res.status(201).json({ message: 'Command created' });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Internal server error' });
	}
});

router.post("/edit/:id", async (req, res) => {
	if (!req.session.roles || !req.session.roles.includes(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to edit commands' });
	}
	if (!validateCommandId(req.params.id)) {
		return res.status(400).json({ message: 'Invalid command id' });
	}

	const parsed = parseCommandInput(req.body);
	if (!parsed.ok) {
		return res.status(400).json({ message: parsed.message });
	}
	try {
		const result = await db.updateCustomCommand({
			identifier: req.params.id,
			name: parsed.name,
			content: parsed.content,
			userId: req.session.user.id,
		});
		if (!result.ok) {
			const status = result.reason === 'not_found' ? 404 : 400;
			return res.status(status).json({ message: result.message || 'Could not update command' });
		}
		res.status(200).json({ message: 'Command updated' });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Internal server error' });
	}
});

router.post("/delete/:id", async(req, res) => {
	if (!req.session.roles || !req.session.roles.includes(config.roles.staff)) {
		return res.status(403).json({ message: 'You do not have permission to delete commands' });
	}
	if (!validateCommandId(req.params.id)) {
		return res.status(400).json({ message: 'Invalid command id' });
	}

	try {
		const result = await db.deleteCustomCommand(req.params.id);
		if (!result.ok) {
			const status = result.reason === 'not_found' ? 404 : 400;
			return res.status(status).json({ message: result.message || 'Could not delete command' });
		}
		res.status(200).json({ message: 'Command deleted' });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Internal server error' });
	}
});

router.get('/slashes', async (req, res) => {
	res.render('slashes', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf });
});

router.get('/slashes/list', async (req, res) => {
	try {
		const commands = await getSlashCommands();
		res.json({ commands });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Error fetching slash commands' });
	}
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff, config.roles.mod, config.roles.uploader];