const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isBulkDeleteEligible,
  matchesPruneFilters,
  matchesPruneType,
} = require('../src/bot/commands/slashCommands/moderation/handlers/modHandlersPrune');

function message(overrides = {}) {
  return {
    author: { id: 'user-1', bot: false },
    embeds: [],
    attachments: { size: 0 },
    createdTimestamp: Date.now(),
    ...overrides,
  };
}

test('matches prune type filters', () => {
  assert.equal(matchesPruneType(message(), 'all'), true);
  assert.equal(matchesPruneType(message({ author: { id: 'bot-1', bot: true } }), 'bot'), true);
  assert.equal(matchesPruneType(message(), 'user'), true);
  assert.equal(matchesPruneType(message({ embeds: [{}] }), 'embed'), true);
  assert.equal(matchesPruneType(message({ attachments: { size: 1 } }), 'attachment'), true);
  assert.equal(matchesPruneType(message(), 'unknown'), false);
});

test('applies optional user filter in addition to type', () => {
  const targetUser = { id: 'user-1' };

  assert.equal(matchesPruneFilters(message(), 'user', targetUser), true);
  assert.equal(matchesPruneFilters(message({ author: { id: 'user-2', bot: false } }), 'user', targetUser), false);
  assert.equal(matchesPruneFilters(message({ author: { id: 'user-1', bot: true } }), 'bot', targetUser), true);
  assert.equal(matchesPruneFilters(message({ author: { id: 'user-1', bot: true } }), 'user', targetUser), false);
});

test('rejects messages older than Discord bulk-delete limit', () => {
  const now = Date.parse('2026-06-26T12:00:00.000Z');
  const thirteenDaysOld = now - 13 * 24 * 60 * 60 * 1000;
  const fourteenDaysOld = now - 14 * 24 * 60 * 60 * 1000;

  assert.equal(isBulkDeleteEligible(message({ createdTimestamp: thirteenDaysOld }), now), true);
  assert.equal(isBulkDeleteEligible(message({ createdTimestamp: fourteenDaysOld }), now), false);
});
