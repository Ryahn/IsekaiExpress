const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLogEvent } = require('discord-api-types/v10');

const {
  mapAuditActionToType,
  buildDeletedContentFromMessage,
  enrichFromAuditEntry,
} = require('../libs/moderationActionLog');

test('mapAuditActionToType maps ban kick unban', () => {
  assert.equal(mapAuditActionToType({ action: AuditLogEvent.MemberBanAdd }), 'ban');
  assert.equal(mapAuditActionToType({ action: AuditLogEvent.MemberKick }), 'kick');
  assert.equal(mapAuditActionToType({ action: AuditLogEvent.MemberBanRemove }), 'unban');
});

test('mapAuditActionToType maps timeout changes only', () => {
  assert.equal(mapAuditActionToType({
    action: AuditLogEvent.MemberUpdate,
    changes: [{ key: 'nick', old: 'a', new: 'b' }],
  }), null);

  assert.equal(mapAuditActionToType({
    action: AuditLogEvent.MemberUpdate,
    changes: [{ key: 'communication_disabled_until', old: null, new: '2099-01-01T00:00:00.000Z' }],
  }), 'timeout');

  assert.equal(mapAuditActionToType({
    action: AuditLogEvent.MemberUpdate,
    changes: [{ key: 'communication_disabled_until', old: '2099-01-01T00:00:00.000Z', new: null }],
  }), 'timeout_remove');
});

test('buildDeletedContentFromMessage includes text and attachments', () => {
  const content = buildDeletedContentFromMessage({
    content: 'hello scam',
    attachments: new Map([
      ['1', { name: 'proof.png', url: 'https://cdn.example/proof.png' }],
    ]),
  });
  assert.match(content, /hello scam/);
  assert.match(content, /proof\.png/);
  assert.match(content, /https:\/\/cdn\.example\/proof\.png/);
});

test('enrichFromAuditEntry extracts executor target and reason', async () => {
  const guild = {
    id: 'guild-1',
    client: {
      users: { fetch: async () => ({ id: 'mod-1', username: 'ModUser' }) },
    },
    members: {
      fetch: async (id) => ({
        id,
        nickname: id === 'target-1' ? 'BadNick' : 'ModNick',
        displayName: id === 'target-1' ? 'BadNick' : 'ModNick',
        user: { id, username: id === 'target-1' ? 'BadUser' : 'ModUser' },
      }),
    },
  };

  const enriched = await enrichFromAuditEntry(guild, {
    id: 'audit-1',
    action: AuditLogEvent.MemberBanAdd,
    targetId: 'target-1',
    executorId: 'mod-1',
    reason: 'spam',
    changes: [],
    extra: null,
  });

  assert.equal(enriched.actionType, 'ban');
  assert.equal(enriched.targetUserId, 'target-1');
  assert.equal(enriched.moderatorUserId, 'mod-1');
  assert.equal(enriched.reason, 'spam');
  assert.equal(enriched.targetDisplayName, 'BadNick');
});

test('repository rejects invalid action types', async () => {
  const original = require('../database/knex');
  const modulePath = require.resolve('../database/repositories/moderationActionLogRepository');
  delete require.cache[modulePath];
  const rows = [];
  const fakeKnex = Object.assign(
    (table) => {
      if (table !== 'moderation_action_logs') throw new Error('unexpected table');
      return {
        insert: async (row) => {
          rows.push(row);
          return [rows.length];
        },
      };
    },
    {
      schema: { hasTable: async () => true },
      fn: { now: () => 'NOW()' },
      raw: original.raw,
    },
  );

  require.cache[require.resolve('../database/knex')].exports = fakeKnex;
  const isolatedRepo = require('../database/repositories/moderationActionLogRepository');

  const invalid = await isolatedRepo.createModerationActionLog({
    guildId: '1',
    actionType: 'not_real',
    targetUserId: '2',
  });
  assert.equal(invalid, null);

  const valid = await isolatedRepo.createModerationActionLog({
    guildId: '1',
    actionType: 'ban',
    targetUserId: '2',
    targetUsername: 'user',
    source: 'bot_auto',
  });
  assert.equal(valid, 1);
  assert.equal(rows[0].action_type, 'ban');

  require.cache[require.resolve('../database/knex')].exports = original;
  delete require.cache[modulePath];
});

test('repository buildRow requires guild and target ids', async () => {
  const original = require('../database/knex');
  const rows = [];
  const fakeKnex = Object.assign(
    (table) => {
      if (table !== 'moderation_action_logs') throw new Error('unexpected table');
      return {
        insert: async (row) => {
          rows.push(row);
          return [rows.length];
        },
      };
    },
    {
      schema: { hasTable: async () => true },
      fn: { now: () => 'NOW()' },
      raw: original.raw,
    },
  );

  require.cache[require.resolve('../database/knex')].exports = fakeKnex;
  delete require.cache[require.resolve('../database/repositories/moderationActionLogRepository')];
  const isolatedRepo = require('../database/repositories/moderationActionLogRepository');

  const missingTarget = await isolatedRepo.createModerationActionLog({
    guildId: '1',
    actionType: 'ban',
    source: 'bot_auto',
  });
  assert.equal(missingTarget, null);

  require.cache[require.resolve('../database/knex')].exports = original;
  delete require.cache[require.resolve('../database/repositories/moderationActionLogRepository')];
});
