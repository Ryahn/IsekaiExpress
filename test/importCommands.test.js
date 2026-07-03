const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildImportPlan,
  findDuplicateGroups,
  summarizeDuplicates,
  getCustomCommandHash,
} = require('../libs/commandsImport');

const helloHash = getCustomCommandHash('hello');
const worldHash = getCustomCommandHash('world');

function jsonRow(name, content, overrides = {}) {
  return {
    hash: getCustomCommandHash(name),
    name,
    content,
    usage: 0,
    created_by: 1,
    updated_by: 1,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

test('buildImportPlan updates existing row by hash and preserves usage', () => {
  const jsonRows = [jsonRow('hello', 'new content')];
  const dbRows = [{
    id: 1,
    hash: helloHash,
    name: 'hello',
    content: 'old content',
    usage: 42,
    created_by: 99,
    created_at: 500,
  }];

  const { actions, summary } = buildImportPlan(jsonRows, dbRows);

  assert.equal(summary.update, 1);
  assert.equal(summary.insert, 0);
  assert.equal(summary.unchanged, 0);

  const update = actions.find((a) => a.action === 'update');
  assert.ok(update);
  assert.equal(update.patch.content, 'new content');
  assert.equal(update.preserve.usage, 42);
  assert.equal(update.preserve.created_by, 99);
  assert.equal(update.preserve.created_at, 500);
});

test('buildImportPlan marks unchanged when name and content match', () => {
  const jsonRows = [jsonRow('hello', 'same')];
  const dbRows = [{ id: 1, hash: helloHash, name: 'hello', content: 'same', usage: 0 }];

  const { summary } = buildImportPlan(jsonRows, dbRows);

  assert.equal(summary.unchanged, 1);
  assert.equal(summary.update, 0);
});

test('buildImportPlan inserts when hash is not in DB', () => {
  const jsonRows = [jsonRow('newcmd', 'content')];
  const { actions, summary } = buildImportPlan(jsonRows, []);

  assert.equal(summary.insert, 1);
  assert.equal(actions[0].action, 'insert');
  assert.equal(actions[0].json.hash, getCustomCommandHash('newcmd'));
});

test('buildImportPlan skips hash mismatch in JSON', () => {
  const jsonRows = [{
    hash: 'deadbeefdeadbeefdeadbeefdeadbeef',
    name: 'hello',
    content: 'x',
  }];
  const { actions, summary } = buildImportPlan(jsonRows, []);

  assert.equal(summary.skipped, 1);
  assert.equal(summary.skippedDetail.hash_mismatch, 1);
  assert.equal(actions[0].reason, 'hash_mismatch');
});

test('buildImportPlan skips name conflict on insert', () => {
  const conflictJson = [jsonRow('other', 'content')];
  const conflictDb = [{ id: 2, hash: helloHash, name: 'other', content: 'old', usage: 0 }];

  const { summary, actions } = buildImportPlan(conflictJson, conflictDb);
  assert.equal(summary.skippedDetail.name_conflict, 1);
  assert.equal(actions[0].reason, 'name_conflict');
});

test('buildImportPlan reports db-only rows', () => {
  const jsonRows = [jsonRow('hello', 'x')];
  const dbRows = [
    { id: 1, hash: helloHash, name: 'hello', content: 'x', usage: 0 },
    { id: 2, hash: worldHash, name: 'world', content: 'y', usage: 0 },
  ];

  const { dbOnly, summary } = buildImportPlan(jsonRows, dbRows);

  assert.equal(summary.dbOnly, 1);
  assert.equal(dbOnly.length, 1);
  assert.equal(dbOnly[0].name, 'world');
});

test('findDuplicateGroups detects JSON hash and name duplicates', () => {
  const jsonRows = [
    jsonRow('hello', 'a'),
    { ...jsonRow('hello', 'b'), hash: helloHash },
    jsonRow('Hello', 'c'),
  ];

  const groups = findDuplicateGroups(jsonRows, [], { by: ['hash', 'name'] });
  const summary = summarizeDuplicates(groups);

  assert.ok(summary.json.hash >= 1);
  assert.ok(summary.json.name >= 1);
});

test('findDuplicateGroups detects DB name duplicates', () => {
  const dbRows = [
    { id: 1, hash: helloHash, name: 'hello', content: 'a' },
    { id: 2, hash: worldHash, name: 'Hello', content: 'b' },
  ];

  const groups = findDuplicateGroups([], dbRows, { by: ['name'] });
  assert.ok(groups.some((g) => g.source === 'db' && g.dimension === 'name'));
});

test('findDuplicateGroups detects cross name/hash mismatch', () => {
  const jsonRows = [jsonRow('hello', 'new')];
  const dbRows = [{ id: 1, hash: helloHash, name: 'renamed', content: 'old', usage: 0 }];

  const groups = findDuplicateGroups(jsonRows, dbRows, { by: ['hash', 'name'] });
  assert.ok(groups.some((g) => g.dimension === 'hash_name_mismatch'));
});

test('findDuplicateGroups respects --by hash only', () => {
  const dbRows = [
    { id: 1, hash: helloHash, name: 'hello', content: 'a' },
    { id: 2, hash: worldHash, name: 'Hello', content: 'b' },
  ];

  const groups = findDuplicateGroups([], dbRows, { by: ['hash'] });
  assert.ok(!groups.some((g) => g.dimension === 'name'));
});
