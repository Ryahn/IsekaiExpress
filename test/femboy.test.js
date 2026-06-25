// Guards the femboy option-name bugfix: the slash option is `tags`, and execute must read it.
const test = require('node:test');
const assert = require('node:assert/strict');

const femboy = require('../src/bot/commands/slashCommands/fun/femboy.js');

test('femboy slash builder defines a "tags" option', () => {
  const json = femboy.data.toJSON();
  assert.ok(
    Array.isArray(json.options) && json.options.some((o) => o.name === 'tags'),
    'builder should expose an option named "tags"',
  );
});

test('femboy execute reads the "tags" option, not "query"', () => {
  const src = femboy.execute.toString();
  assert.match(src, /getString\(\s*['"]tags['"]\s*\)/, 'should read getString("tags")');
  assert.doesNotMatch(src, /getString\(\s*['"]query['"]\s*\)/, 'must not read the nonexistent "query" option');
});

test('femboy URL-encodes the user-supplied tags', () => {
  const src = femboy.execute.toString();
  assert.match(src, /encodeURIComponent\(\s*query\s*\)/, 'tags must be encodeURIComponent-wrapped in the URL');
});
