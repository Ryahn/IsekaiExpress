const { PermissionFlagsBits } = require('discord.js');

/**
 * Guild Administrator permission or the configured staff role (ROLE_STAFF / DISCORD_STAFF_ROLE_ID).
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @param {string} [staffRoleId]
 * @param {string} [modRoleId]
 */
function hasGuildAdminOrStaffRole(member, staffRoleId) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const staffId = typeof staffRoleId === 'string' ? staffRoleId.trim() : '';
  if (!staffId) return false;
  return member.roles.cache.has(staffId);
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
  const modId = typeof modRoleId === 'string' ? modRoleId.trim() : '';
  if (!modId) return false;
  return member.roles.cache.has(modId);
}

module.exports = { hasGuildAdminOrStaffRole, hasGuildAdminOrModRole };
