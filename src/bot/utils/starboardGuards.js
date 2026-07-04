const { denyEphemeral, requireGuildManager } = require('./permissionGuards');
const { hasStarboardRole, hasStarboardAdminRole } = require('../../../libs/starboardAuth');

async function requireStarboardManager(client, interaction, settings) {
  const member = interaction.member;
  if (!member) {
    await denyEphemeral(interaction, 'This action can only be used in a server.');
    return false;
  }

  if (hasStarboardRole(client, member, settings)) return true;

  const allowedRoleIds = settings?.allowedRoleIds || [];
  if (allowedRoleIds.length === 0) {
    return requireGuildManager(client, interaction);
  }

  await denyEphemeral(
    interaction,
    'You need Administrator permission or a configured starboard role to do that.',
  );
  return false;
}

async function requireStarboardAdmin(client, interaction, settings) {
  const member = interaction.member;
  if (!member) {
    await denyEphemeral(interaction, 'This action can only be used in a server.');
    return false;
  }

  if (hasStarboardAdminRole(client, member, settings)) return true;

  const adminRoleIds = settings?.adminRoleIds || [];
  if (adminRoleIds.length === 0) {
    return requireStarboardManager(client, interaction, settings);
  }

  await denyEphemeral(
    interaction,
    'You need Administrator permission or a configured starboard admin role to do that.',
  );
  return false;
}

module.exports = {
  hasStarboardRole,
  hasStarboardAdminRole,
  requireStarboardManager,
  requireStarboardAdmin,
};
