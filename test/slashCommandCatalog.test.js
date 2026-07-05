const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSlashCommands,
  getSlashCommandFiles,
} = require('../libs/slashCommandCatalog');

test('getSlashCommands includes flattened subcommands', async () => {
  const commands = await getSlashCommands();

  assert.ok(commands.length > 60, 'expected subcommands to expand the catalog beyond top-level files');
  assert.ok(commands.every((cmd) => typeof cmd.command === 'string' && cmd.command.startsWith('/')));
  assert.ok(commands.every((cmd) => typeof cmd.path === 'string' && cmd.path.length > 0));
  assert.ok(commands.every((cmd) => typeof cmd.category === 'string'));
  assert.ok(commands.every((cmd) => typeof cmd.description === 'string'));

  const modAddGuild = commands.find((cmd) => cmd.path === 'mod blacklist add-guild');
  assert.ok(modAddGuild, 'mod blacklist add-guild should be listed');
  assert.equal(modAddGuild.command, '/mod blacklist add-guild');
  assert.equal(modAddGuild.category, 'moderation');

  const farmServerOn = commands.find((cmd) => cmd.path === 'farm server on');
  assert.ok(farmServerOn, 'farm server on should be listed');
  assert.equal(farmServerOn.command, '/farm server on');
  assert.equal(farmServerOn.category, 'farm');

  const attentionMod = commands.find((cmd) => cmd.path === 'attention mod');
  assert.ok(attentionMod, 'attention mod should be listed');
  assert.equal(attentionMod.category, 'misc');

  const kiss = commands.find((cmd) => cmd.path === 'kiss');
  assert.ok(kiss, 'simple slash commands should still appear');
  assert.equal(kiss.command, '/kiss');
});

test('getSlashCommandFiles skips handlers directories', () => {
  const files = getSlashCommandFiles(require('node:path').join(__dirname, '../src/bot/commands/slashCommands'));
  assert.ok(files.length > 0);
  assert.ok(!files.some((file) => file.includes(`${require('node:path').sep}handlers${require('node:path').sep}`)));
});
