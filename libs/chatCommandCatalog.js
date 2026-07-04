const fs = require('fs');
const path = require('path');
const BaseCommand = require('../src/bot/utils/structures/BaseCommand');

const chatCommandsPath = path.join(__dirname, '../src/bot/commands/chatCommands');

function getChatCommandFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return getChatCommandFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

function getChatCommands() {
  const commands = [];

  for (const file of getChatCommandFiles(chatCommandsPath)) {
    try {
      const Module = require(file);
      if (!(Module.prototype instanceof BaseCommand)) {
        continue;
      }

      const instance = new Module();
      commands.push({
        name: instance.name,
        category: instance.category || '',
        aliases: Array.isArray(instance.aliases) ? instance.aliases.filter(Boolean) : [],
        description: instance.description || '',
      });
    } catch (error) {
      console.error(`Failed to load chat command metadata from ${file}:`, error);
    }
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  getChatCommands,
  getChatCommandFiles,
};
