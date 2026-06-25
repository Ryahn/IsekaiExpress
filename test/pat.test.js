// Guards the pat command fix: the option is `target`, and execute must reference `target`
// (not the undefined `targetUser`, which threw a ReferenceError on every invocation).
const test = require('node:test');
const assert = require('node:assert/strict');

const pat = require('../src/bot/commands/slashCommands/fun/pat.js');

test('pat slash builder defines a "target" option', () => {
  const json = pat.data.toJSON();
  assert.ok(
    Array.isArray(json.options) && json.options.some((o) => o.name === 'target'),
    'builder should expose an option named "target"',
  );
});

test('pat execute reads "target" and does not reference undefined targetUser', () => {
  const src = pat.execute.toString();
  assert.match(src, /getUser\(\s*['"]target['"]\s*\)/, 'should read getUser("target")');
  assert.doesNotMatch(src, /\btargetUser\b/, 'must not reference the undefined targetUser variable');
});
