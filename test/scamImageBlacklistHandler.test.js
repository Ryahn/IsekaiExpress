const test = require('node:test');
const assert = require('node:assert/strict');

const {
  blacklistAddImageTextExecute,
} = require('../src/bot/commands/slashCommands/moderation/handlers/modHandlersScamImageBlacklist');

function fakeInteraction({ pattern, type }) {
  const replies = [];
  return {
    member: {
      permissions: { has: () => false },
      roles: {
        cache: {
          has: (id) => id === 'staff-role',
          some: (fn) => fn({ id: 'staff-role' }),
        },
      },
    },
    deferred: true,
    ephemeral: false,
    inGuild: () => true,
    user: { id: 'staff-user' },
    options: {
      getString: (name) => (name === 'pattern' ? pattern : type),
    },
    editReply: async (payload) => replies.push(payload),
    deleteReply: async () => {},
    followUp: async (payload) => replies.push(payload),
    _replies: replies,
  };
}

test('add-image-text keyword writes through the DB helper', async () => {
  let inserted = null;
  const client = {
    config: { roles: { staff: 'staff-role' } },
    db: {
      insertImageTextBlacklist: async (row) => {
        inserted = row;
      },
    },
  };
  const interaction = fakeInteraction({ pattern: 'porewin', type: 'keyword' });

  await blacklistAddImageTextExecute(client, interaction);

  assert.deepEqual(inserted, {
    pattern: 'porewin',
    pattern_type: 'keyword',
    added_by: 'staff-user',
  });
  assert.match(String(interaction._replies[0]), /Added image text rule/);
});

test('add-image-text rejects regex while regex support is disabled', async () => {
  let inserted = false;
  const client = {
    config: { roles: { staff: 'staff-role' } },
    db: {
      insertImageTextBlacklist: async () => {
        inserted = true;
      },
    },
  };
  const interaction = fakeInteraction({ pattern: '/porewin/i', type: 'regex' });

  await blacklistAddImageTextExecute(client, interaction);

  assert.equal(inserted, false);
  assert.match(interaction._replies[0].content, /Regex image scam rules are not enabled yet/);
});

test('add-image-text domain writes through the DB helper', async () => {
  let inserted = null;
  const client = {
    config: { roles: { staff: 'staff-role' } },
    db: {
      insertImageTextBlacklist: async (row) => {
        inserted = row;
      },
    },
  };
  const interaction = fakeInteraction({ pattern: 'example.com', type: 'domain' });

  await blacklistAddImageTextExecute(client, interaction);

  assert.deepEqual(inserted, {
    pattern: 'example.com',
    pattern_type: 'domain',
    added_by: 'staff-user',
  });
  assert.match(String(interaction._replies[0]), /Added image text rule/);
});
