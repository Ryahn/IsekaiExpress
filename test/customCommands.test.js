const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db');
const customCommandSlash = require('../src/bot/commands/slashCommands/moderation/custom_command');

test.after(async () => {
  try {
    await db.end();
  } catch (_) {
    /* ignore */
  }
});

test('custom command names are normalized before validation and hashing', () => {
  const name = '  Hello_World-1  ';

  assert.equal(db.normalizeCustomCommandName(name), 'Hello_World-1');
  assert.deepEqual(db.validateCustomCommandName(name), { ok: true, name: 'Hello_World-1' });
  assert.equal(db.getCustomCommandHash(name), db.getCustomCommandHash('hello_world-1'));
});

test('custom command name validation rejects names that cannot be invoked as one prefix token', () => {
  for (const name of ['', 'two words', 'slash/name', 'x'.repeat(65)]) {
    const result = db.validateCustomCommandName(name);
    assert.equal(result.ok, false, `${JSON.stringify(name)} should be rejected`);
    assert.equal(typeof result.message, 'string');
  }
});

test('custom command identifiers distinguish numeric ids from names', () => {
  assert.deepEqual(db.parseCustomCommandIdentifier('123'), { id: '123' });
  assert.deepEqual(db.parseCustomCommandIdentifier(' hello '), { name: 'hello' });
  assert.equal(db.parseCustomCommandIdentifier('   '), null);
});

test('custom command content is trimmed for modal-created commands', () => {
  assert.equal(db.normalizeCustomCommandContent('  hello {mention}  '), 'hello {mention}');
});

test('custom command slash builder exposes the expected subcommands', () => {
  const json = customCommandSlash.data.toJSON();
  const subcommands = json.options.map((option) => option.name).sort();

  assert.equal(json.name, 'custom_command');
  assert.deepEqual(subcommands, ['add', 'edit', 'get_info', 'remove']);
});
