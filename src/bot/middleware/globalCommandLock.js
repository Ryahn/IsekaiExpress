const { hasGuildAdminOrStaffRole } = require('../utils/guildPrivileges');

const BYPASS_SLASH = new Set(['global', 'help']);

function isOwner(client, userId) {
  return String(client.config?.discord?.ownerId) === String(userId);
}

function memberCanBypassGlobalLock(client, member) {
  if (!member) return false;
  if (isOwner(client, member.id)) return true;
  if (hasGuildAdminOrStaffRole(member, client.config?.roles?.staff)) return true;
  return member.roles?.cache?.some((r) => client.allowed?.includes(r.id)) ?? false;
}

/**
 * @param {{ locked: boolean, channelIds: string[] }} state
 * @param {string} channelId
 * @param {import('discord.js').GuildMember | null} member
 */
function globalLockAllows(client, state, channelId, member) {
  if (!state?.locked) return true;
  if (memberCanBypassGlobalLock(client, member)) return true;
  if (!state.channelIds?.length) return false;
  return state.channelIds.includes(channelId);
}

/**
 * @returns {Promise<{ allowed: true } | { allowed: false, message: string }>}
 */
async function checkInteractionGlobalCommandLock(client, interaction) {
  if (!interaction.inGuild() || !interaction.isChatInputCommand()) {
    return { allowed: true };
  }
  if (BYPASS_SLASH.has(interaction.commandName)) {
    return { allowed: true };
  }
  const guildId = interaction.guildId;
  const state = client.guildGlobalLock?.get(guildId);
  if (!state?.locked) {
    return { allowed: true };
  }
  let guild = interaction.guild;
  if (!guild) {
    guild = await client.guilds.fetch(interaction.guildId);
  }
  const member = await guild.members.fetch(interaction.user.id);
  if (globalLockAllows(client, state, interaction.channelId, member)) {
    return { allowed: true };
  }
  const mention =
    state.channelIds?.map((id) => `<#${id}>`).join(', ') || 'the configured command channel(s)';
  return { allowed: false, message: `Commands are currently restricted. Use: ${mention}` };
}

/**
 * @returns {Promise<{ allowed: true } | { allowed: false, message: string }>}
 */
async function checkMessageGlobalCommandLock(client, message) {
  if (!message.guild || !message.member) {
    return { allowed: true };
  }
  const guildId = message.guild.id;
  const state = client.guildGlobalLock?.get(guildId);
  if (!state?.locked) {
    return { allowed: true };
  }
  if (globalLockAllows(client, state, message.channelId, message.member)) {
    return { allowed: true };
  }
  const mention =
    state.channelIds?.map((id) => `<#${id}>`).join(', ') || 'the configured command channel(s)';
  return { allowed: false, message: `Commands are currently restricted. Use: ${mention}` };
}

module.exports = {
  checkInteractionGlobalCommandLock,
  checkMessageGlobalCommandLock,
  updateGuildGlobalLockCache: (client, guildId, locked, channelIds) => {
    if (!client.guildGlobalLock) return;
    client.guildGlobalLock.set(guildId, { locked, channelIds: channelIds || [] });
  },
  parseWhitelistJson: (raw) => {
    if (!raw || raw === 'null') return [];
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a.map(String) : [];
    } catch {
      return [];
    }
  }
};
