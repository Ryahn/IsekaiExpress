const { PermissionFlagsBits } = require('discord.js');

/**
 * Guild Administrator permission or the configured staff role (ROLE_STAFF / DISCORD_STAFF_ROLE_ID).
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @param {string} [staffRoleId]
 */
function hasGuildAdminOrStaffRole(member, staffRoleId) {
	if (!member) return false;
	if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
	const id = typeof staffRoleId === 'string' ? staffRoleId.trim() : '';
	if (!id) return false;
	return member.roles.cache.has(id);
}

module.exports = { hasGuildAdminOrStaffRole };
