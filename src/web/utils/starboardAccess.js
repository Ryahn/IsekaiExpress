const { REST } = require('@discordjs/rest');
const { Routes, PermissionFlagsBits } = require('discord-api-types/v10');
const config = require('../../../config');
const { hasStarboardAccessByRoleIds } = require('../../../libs/starboardAuth');

const rest = new REST({ version: '10' }).setToken(config.discord.botToken);

async function fetchGuildMember(userId) {
  return rest.get(Routes.guildMember(config.discord.guildId, userId));
}

async function canManageStarboard(req, settings) {
  if (!req.session?.user?.id) return false;
  try {
    const member = await fetchGuildMember(req.session.user.id);
    const permissions = BigInt(member.permissions || '0');
    if ((permissions & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator)) {
      return true;
    }
    const userRoles = Array.isArray(member.roles) ? member.roles : [];
    return hasStarboardAccessByRoleIds(config, userRoles, settings);
  } catch {
    return false;
  }
}

module.exports = {
  rest,
  fetchGuildMember,
  canManageStarboard,
};
