// Structural smoke test for the repository split. Verifies the db.js export surface and the
// repository index without needing a live database. Requiring db.js opens the knex pool, so we
// destroy it in after() to let the test runner exit cleanly (works with or without MySQL up).
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db');
const repositories = require('../database/repositories');

test.after(async () => {
  try {
    await db.end();
  } catch (_) {
    /* ignore */
  }
});

test('db.js preserves core knex accessors', () => {
  assert.equal(typeof db.query, 'function', 'knex query builder');
  assert.ok(db.db, 'raw knex instance');
  assert.equal(typeof db.end, 'function');
  assert.equal(typeof db.sql, 'function');
});

test('Objection models are no longer exported (objection removed)', () => {
  assert.equal(db.User, undefined, 'no unused User model on the db surface');
});

test('db.js re-exports key functions from every domain', () => {
  const expected = [
    // xp
    'getUserXP', 'updateUserXPAndLevel', 'addUserXP', 'getLeaderboard', 'getUserRank',
    'getXPSettings', 'updateXPSettings', 'toggleDoubleXP', 'checkUser',
    'incrementGuildUserMessageCount', 'getGuildUserMessageCount',
    // moderation
    'createWarning', 'deleteWarning', 'getWarningsOffset', 'createBan', 'removeBan',
    'createCage', 'getCage', 'getCagedUsers', 'removeCage', 'getExpiredCagedUsers',
    // guild
    'createGuild', 'deleteGuild', 'getGuildConfigurable', 'updateGuildGlobalCommandLock',
    // command settings
    'createCommandSettings', 'getAllowedChannel', 'updateCommandSettings', 'getCommand',
    'refreshCustomCommandsCache', 'bumpCustomCommandsRevision',
    'normalizeCustomCommandName', 'normalizeCustomCommandContent', 'validateCustomCommandName',
    'getCustomCommandHash', 'parseCustomCommandIdentifier', 'getCustomCommandByIdentifier',
    'createCustomCommand', 'updateCustomCommand', 'deleteCustomCommand',
    // image / review
    'hasImageReviewApproval', 'upsertImageReviewApproval', 'insertPendingImageReview',
    'insertImageHashBlacklist', 'listImageTextBlacklist',
    // attention / misc
    'insertAttentionRequest', 'claimAttentionRequestStatus', 'createChannelStats',
    'getAfkUser', 'createAfkUser',
  ];
  for (const name of expected) {
    assert.equal(typeof db[name], 'function', `db.${name} should be a function`);
  }
});

test('createGuild writes the production column guildOwnerId (not owner_id)', () => {
  // Guards the live-schema fix: the Guilds owner column is `guildOwnerId` in migration/snapshot/prod.
  const src = repositories.guildRepository.createGuild.toString();
  assert.match(src, /guildOwnerId\s*:/, 'createGuild should insert a guildOwnerId column');
  assert.doesNotMatch(src, /owner_id\s*:/, 'createGuild must not insert an owner_id column');
});

test('checkUser uses an atomic upsert (no race-prone read-then-insert)', () => {
  // Guards the discord_id duplicate-recurrence fix.
  const src = repositories.xpRepository.checkUser.toString();
  assert.match(src, /onConflict\(\s*['"]discord_id['"]\s*\)/, 'should upsert via onConflict(discord_id)');
  assert.match(src, /\.merge\(/, 'should merge on conflict');
  assert.doesNotMatch(src, /\.where\(\s*\{\s*discord_id/, 'must not read-then-insert by discord_id');
});

test('repository index exposes the expected named groups', () => {
  for (const group of [
    'xpRepository',
    'moderationRepository',
    'guildRepository',
    'commandSettingsRepository',
    'imageReviewRepository',
    'attentionRepository',
  ]) {
    assert.equal(typeof repositories[group], 'object', `${group} present`);
  }
  assert.equal(typeof repositories.xpRepository.addUserXP, 'function');
  assert.equal(typeof repositories.moderationRepository.createCage, 'function');
});

test('no db function name is silently dropped (count matches sum of repos)', () => {
  const repoFnCount = Object.values(repositories).reduce(
    (n, repo) => n + Object.keys(repo).length,
    0,
  );
  // 82 moved functions across the six repositories.
  assert.equal(repoFnCount, 82, `expected 82 repository functions, found ${repoFnCount}`);
});
