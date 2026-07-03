const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseRandomBlock,
  pickRandomOption,
  pickWeightedOption,
  parseCommandContent,
  migrateRandomSyntax,
  AI_COMMAND_CONTENT,
} = require('../libs/customCommandParser');

test('parseRandomBlock splits only on tilde and preserves commas inside options', () => {
  const options = parseRandomBlock(
    "I'm sorry Dave, I'm afraid I can't do that.~This mission is too important for me to allow you to jeopardize it.",
  );

  assert.equal(options.length, 2);
  assert.match(options[0], /I'm sorry Dave, I'm afraid/);
  assert.match(options[1], /too important/);
});

test('parseCommandContent returns a full HAL quote instead of comma fragments', () => {
  const content = AI_COMMAND_CONTENT;
  const seen = new Set();

  for (let i = 0; i < 30; i += 1) {
    const result = parseCommandContent(content, { author: { id: '123' } });
    seen.add(result);
    assert.ok(result.length > 20);
    assert.doesNotMatch(result, /^I'm sorry Dave$/);
    assert.doesNotMatch(result, /^ because one plus one equals two\.$/);
  }

  assert.ok(seen.size > 1);
});

test('parseCommandContent supports URL lists separated by tilde', () => {
  const content = '{random~https://example.com/a~https://example.com/b~https://example.com/c}';
  const seen = new Set();

  for (let i = 0; i < 20; i += 1) {
    seen.add(parseCommandContent(content));
  }

  assert.deepEqual([...seen].sort(), [
    'https://example.com/a',
    'https://example.com/b',
    'https://example.com/c',
  ]);
});

test('pickWeightedOption respects configured weights', () => {
  const options = ['70|common', '10|rare-a', '10|rare-b', '10|rare-c'];
  const counts = { common: 0, 'rare-a': 0, 'rare-b': 0, 'rare-c': 0 };

  for (let i = 0; i < 5000; i += 1) {
    counts[pickWeightedOption(options)] += 1;
  }

  assert.ok(counts.common > counts['rare-a']);
  assert.ok(counts.common > counts['rare-b']);
  assert.ok(counts.common > counts['rare-c']);
});

test('parseCommandContent supports legacy colon syntax as an alias', () => {
  const content = "{random:alpha~beta, with comma~gamma}";
  const seen = new Set();

  for (let i = 0; i < 20; i += 1) {
    seen.add(parseCommandContent(content));
  }

  assert.deepEqual([...seen].sort(), ['alpha', 'beta, with comma', 'gamma']);
});

test('parseCommandContent replaces mention after random expansion', () => {
  const content = '{random~Hey {mention}~Hello {mention}}';
  const result = parseCommandContent(content, { author: { id: '999' } });

  assert.ok(result === 'Hey <@999>' || result === 'Hello <@999>');
});

test('parseCommandContent returns empty string for empty random blocks', () => {
  assert.equal(parseCommandContent('{random~}', { author: { id: '1' } }), '');
  assert.equal(parseCommandContent('{random:}', { author: { id: '1' } }), '');
});

test('pickRandomOption falls back to uniform pick for mixed weighted entries', () => {
  const options = ['70|weighted', 'plain-text'];
  const seen = new Set();

  for (let i = 0; i < 20; i += 1) {
    seen.add(pickRandomOption(options));
  }

  assert.deepEqual([...seen].sort(), ['70|weighted', 'plain-text']);
});

test('migrateRandomSyntax converts comma URL lists and weighted entries to tilde syntax', () => {
  assert.equal(
    migrateRandomSyntax('{random:https://a.com,https://b.com}'),
    '{random~https://a.com~https://b.com}',
  );
  assert.equal(
    migrateRandomSyntax('{random:70|https://a.com,10|https://b.com}'),
    '{random~70|https://a.com~10|https://b.com}',
  );
});

test('migrateRandomSyntax preserves tilde-separated bodies and only changes the opener', () => {
  assert.equal(
    migrateRandomSyntax("{random:Hello, world~Goodbye, friend}"),
    '{random~Hello, world~Goodbye, friend}',
  );
});

test('migrateRandomSyntax converts ai command content to canonical syntax', () => {
  const migrated = migrateRandomSyntax(
    "{random:I'm sorry Dave, I'm afraid I can't do that.~This mission is too important for me to allow you to jeopardize it.}",
  );

  assert.equal(
    migrated,
    "{random~I'm sorry Dave, I'm afraid I can't do that.~This mission is too important for me to allow you to jeopardize it.}",
  );
});
