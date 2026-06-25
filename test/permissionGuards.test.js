// Focused tests for the permission guards. No live Discord — fake interactions/members.
// Run with: npm test  (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');

const {
  requireStaff,
  requireModerator,
  requireGuildManager,
} = require('../src/bot/utils/permissionGuards');

const STAFF_ROLE = '111';
const MOD_ROLE = '222';
const client = { config: { roles: { staff: STAFF_ROLE, mod: MOD_ROLE } } };

/** Build a fake GuildMember with a set of permission flags and role ids. */
function fakeMember({ perms = [], roles = [] } = {}) {
  const permSet = new Set(perms);
  const roleSet = new Set(roles);
  return {
    permissions: { has: (flag) => permSet.has(flag) },
    roles: {
      cache: {
        has: (id) => roleSet.has(id),
        some: (fn) => [...roleSet].some((id) => fn({ id })),
      },
    },
  };
}

/** Build a fake interaction that records its replies and simulates the public-defer state. */
function fakeInteraction(member, { inGuild = true } = {}) {
  const calls = [];
  return {
    member,
    deferred: true,
    replied: false,
    ephemeral: false, // mod command defers publicly
    inGuild: () => inGuild,
    deleteReply: async () => calls.push({ type: 'delete' }),
    editReply: async (p) => calls.push({ type: 'edit', payload: p }),
    followUp: async (p) => calls.push({ type: 'followUp', payload: p }),
    reply: async (p) => calls.push({ type: 'reply', payload: p }),
    _calls: calls,
  };
}

const EPHEMERAL = 1 << 6; // MessageFlags.Ephemeral

test('requireStaff allows Administrator', async () => {
  const i = fakeInteraction(fakeMember({ perms: [PermissionFlagsBits.Administrator] }));
  assert.equal(await requireStaff(client, i), true);
  assert.equal(i._calls.length, 0, 'no denial reply when allowed');
});

test('requireStaff allows configured staff role', async () => {
  const i = fakeInteraction(fakeMember({ roles: [STAFF_ROLE] }));
  assert.equal(await requireStaff(client, i), true);
});

test('requireStaff denies a normal user, ephemerally, without throwing', async () => {
  const i = fakeInteraction(fakeMember({ roles: ['999'] }));
  assert.equal(await requireStaff(client, i), false);
  // public defer → must delete then follow up ephemerally
  assert.deepEqual(i._calls.map((c) => c.type), ['delete', 'followUp']);
  const followUp = i._calls.find((c) => c.type === 'followUp');
  assert.equal(followUp.payload.flags, EPHEMERAL, 'denial must be ephemeral');
});

test('requireModerator allows mod role but requireStaff does not', async () => {
  const modOnly = () => fakeInteraction(fakeMember({ roles: [MOD_ROLE] }));
  assert.equal(await requireModerator(client, modOnly()), true);
  assert.equal(await requireStaff(client, modOnly()), false);
});

test('requireGuildManager allows Manage Server permission', async () => {
  const i = fakeInteraction(fakeMember({ perms: [PermissionFlagsBits.ManageGuild] }));
  assert.equal(await requireGuildManager(client, i), true);
});

test('guards deny when interaction is not in a guild (no member)', async () => {
  const i = fakeInteraction(null, { inGuild: false });
  assert.equal(await requireModerator(client, i), false);
  assert.ok(i._calls.length > 0, 'sends a denial');
});

test('standardization: raw Discord perms (BanMembers/ManageRoles) without a configured role are denied by requireModerator', async () => {
  // Documents the intentional behavior change: moderation guards now key off Administrator
  // or the configured staff/mod roles, NOT raw Discord permissions like BanMembers/ManageRoles.
  const banOnly = fakeInteraction(fakeMember({ perms: [PermissionFlagsBits.BanMembers] }));
  assert.equal(await requireModerator(client, banOnly), false);

  const manageRolesOnly = fakeInteraction(fakeMember({ perms: [PermissionFlagsBits.ManageRoles] }));
  assert.equal(await requireModerator(client, manageRolesOnly), false);
});

test('Administrator passes every lane (admin-only commands stay reachable by admins)', async () => {
  const admin = () => fakeInteraction(fakeMember({ perms: [PermissionFlagsBits.Administrator] }));
  assert.equal(await requireStaff(client, admin()), true);
  assert.equal(await requireModerator(client, admin()), true);
  assert.equal(await requireGuildManager(client, admin()), true);
});

test('non-deferred interaction (button) denies via plain ephemeral reply', async () => {
  const i = fakeInteraction(fakeMember({ roles: ['999'] }));
  i.deferred = false;
  i.replied = false;
  assert.equal(await requireStaff(client, i), false);
  assert.deepEqual(i._calls.map((c) => c.type), ['reply']);
  assert.equal(i._calls[0].payload.flags, EPHEMERAL);
});
