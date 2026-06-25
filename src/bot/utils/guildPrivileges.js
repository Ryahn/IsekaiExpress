const { PermissionFlagsBits } = require('discord.js');

/**
 * @param {import('discord.js').Guild | null | undefined} guild
 * @param {string} userId
 * @returns {Promise<import('discord.js').GuildMember | null>}
 */
async function fetchMemberForPrivilegeCheck(guild, userId) {
  if (!guild || !userId) return null;
  try {
    return await guild.members.fetch({ user: userId, force: true });
  } catch {
    return null;
  }
}

/**
 * Guild Administrator permission or the configured staff role (ROLE_STAFF / DISCORD_STAFF_ROLE_ID).
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @param {string} [staffRoleId]
 * @param {string} [modRoleId]
 */
function hasGuildAdminOrStaffRole(member, staffRoleId) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return hasConfiguredGuildRole(member, staffRoleId);
}

/**
 * Guild Administrator, configured staff role, or configured mod role.
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @param {string} [staffRoleId]
 * @param {string} [modRoleId]
 */
function hasGuildAdminOrModRole(member, staffRoleId, modRoleId) {
  if (!member) return false;
  if (hasGuildAdminOrStaffRole(member, staffRoleId)) return true;
  return hasConfiguredGuildRole(member, modRoleId);
}

function normalizedRoleId(roleId) {
  return typeof roleId === 'string' ? roleId.trim() : '';
}

function hasConfiguredGuildRole(member, roleId) {
  if (!member) return false;
  const id = normalizedRoleId(roleId);
  if (!id) return false;
  if (member.roles.cache.has(id)) return true;
  return member.roles.cache.some((role) => String(role.id) === id);
}

function isGuildTrialMod(member, roles) {
  return hasConfiguredGuildRole(member, roles?.trialmod);
}

/** /attention mod — staff, mods, uploaders, trial mods, or Administrator. */
function canUseAttentionModLane(member, roles) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (!roles) return false;
  return (
    hasConfiguredGuildRole(member, roles.staff) ||
    hasConfiguredGuildRole(member, roles.mod) ||
    hasConfiguredGuildRole(member, roles.uploader) ||
    isGuildTrialMod(member, roles)
  );
}

/** /attention staff — staff, mod, uploader, or trial mod (plus Administrator). */
function canUseAttentionStaffLane(member, roles) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (!roles) return false;
  return (
    hasConfiguredGuildRole(member, roles.staff) ||
    hasConfiguredGuildRole(member, roles.mod) ||
    hasConfiguredGuildRole(member, roles.uploader) ||
    isGuildTrialMod(member, roles)
  );
}

module.exports = {
  hasGuildAdminOrStaffRole,
  hasGuildAdminOrModRole,
  hasConfiguredGuildRole,
  isGuildTrialMod,
  fetchMemberForPrivilegeCheck,
  canUseAttentionModLane,
  canUseAttentionStaffLane,
};
