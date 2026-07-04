const { PermissionFlagsBits } = require('discord.js');

function hasConfiguredRole(member, roleId) {
  const id = typeof roleId === 'string' ? roleId.trim() : '';
  if (!member || !id) return false;
  return member.roles.cache.has(id);
}

/**
 * Whether the member may react with the star emoji or manage starboard settings.
 * Administrator always passes. Empty allowed list falls back to guild managers.
 */
function hasStarboardRole(client, member, settings) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;

  const allowedRoleIds = settings?.allowedRoleIds || [];
  if (allowedRoleIds.length > 0) {
    return allowedRoleIds.some((roleId) => member.roles.cache.has(String(roleId)));
  }

  const roles = client.config?.roles || {};
  return (
    member.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    hasConfiguredRole(member, roles.staff) ||
    hasConfiguredRole(member, roles.mod)
  );
}

function hasStarboardAccessByRoleIds(config, userRoleIds, settings) {
  if (!Array.isArray(userRoleIds)) return false;

  const allowedRoleIds = settings?.allowedRoleIds || [];
  if (allowedRoleIds.length > 0) {
    return allowedRoleIds.some((roleId) => userRoleIds.includes(String(roleId)));
  }

  const roles = config?.roles || {};
  return [roles.staff, roles.mod].some((roleId) => roleId && userRoleIds.includes(String(roleId)));
}

module.exports = {
  hasStarboardRole,
  hasStarboardAccessByRoleIds,
};
