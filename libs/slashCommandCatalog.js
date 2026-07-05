const fs = require('node:fs');
const path = require('node:path');

const slashCommandsPath = path.join(__dirname, '../src/bot/commands/slashCommands');

const SUB_COMMAND = 1;
const SUB_COMMAND_GROUP = 2;

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

function getCategoryFromFile(filePath) {
	const relative = path.relative(slashCommandsPath, filePath);
	const parts = relative.split(path.sep);
	return parts.length > 1 ? parts[0] : 'misc';
}

function flattenOptions(options, parts, category, rows) {
	if (!Array.isArray(options) || options.length === 0) {
		return;
	}

	for (const option of options) {
		if (option.type === SUB_COMMAND_GROUP) {
			flattenOptions(option.options, parts.concat(option.name), category, rows);
			continue;
		}

		if (option.type === SUB_COMMAND) {
			const pathParts = parts.concat(option.name);
			const pathStr = pathParts.join(' ');
			rows.push({
				command: `/${pathStr}`,
				path: pathStr,
				category,
				description: option.description || '',
			});
		}
	}
}

async function loadCommandJson(file) {
	const command = require(file);
	const commandData = typeof command.data === 'function' ? await command.data() : command.data;
	if (!commandData || typeof commandData.toJSON !== 'function') {
		return null;
	}
	return commandData.toJSON();
}

async function getSlashCommands() {
	const rows = [];

	for (const file of getSlashCommandFiles(slashCommandsPath)) {
		try {
			const json = await loadCommandJson(file);
			if (!json || !json.name) {
				continue;
			}

			const category = getCategoryFromFile(file);
			const hasSubcommands = Array.isArray(json.options) && json.options.some(
				(option) => option.type === SUB_COMMAND || option.type === SUB_COMMAND_GROUP,
			);

			if (!hasSubcommands) {
				rows.push({
					command: `/${json.name}`,
					path: json.name,
					category,
					description: json.description || '',
				});
				continue;
			}

			flattenOptions(json.options, [json.name], category, rows);
		} catch (error) {
			console.error(`Failed to load slash command metadata from ${file}:`, error);
		}
	}

	return rows.sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = {
	getSlashCommands,
	getSlashCommandFiles,
	flattenOptions,
};
