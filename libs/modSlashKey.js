const crypto = require('crypto');

/**
 * Stable key for /mod subcommands: `mod:<group>:<subcommand>`.
 * Used for command_settings hashes and cooldown buckets.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
function modSlashLogicalKey(interaction) {
  if (interaction.commandName !== 'mod') return interaction.commandName;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);
  if (group && sub) return `mod:${group}:${sub}`;
  if (sub) return `mod:${sub}`;
  return 'mod';
}

function modSlashHash(interaction) {
  return crypto.createHash('md5').update(modSlashLogicalKey(interaction)).digest('hex');
}

/** Human-readable label for command_settings picker */
function modSlashDisplayName(interaction) {
  const k = modSlashLogicalKey(interaction);
  return k.replace(/:/g, ' ');
}

/**
 * Seeds: { logicalKey, channelId } — channelId default for moderation from ready.js
 */
const MOD_COMMAND_LOGICAL_KEYS = [
  'mod:blacklist:add-guild',
  'mod:blacklist:add-invite',
  'mod:blacklist:remove',
  'mod:blacklist:list',
  'mod:blacklist:check',
  'mod:review:set',
  'mod:review:view',
  'mod:review:approve-user',
  'mod:review:revoke-user',
  'mod:warnings:warn',
  'mod:warnings:warnings',
  'mod:warnings:delwarn',
  'mod:bans:list',
  'mod:bans:unban',
  'mod:cage:apply',
  'mod:cage:remove',
  'mod:cage:list',
  'mod:xp:settings',
  'mod:xp:user',
  'mod:xp:doublexp',
  'mod:xp:import_rank',
  'mod:server:settings',
  'mod:server:channel_settings',
  'mod:server:channel_stats',
  'mod:server:copy_channel',
  'mod:server:update_command_settings',
  'mod:global:lock_on',
  'mod:global:lock_off',
  'mod:global:whitelist',
  'mod:help:docs',
];

const OBSOLETE_MODERATION_COMMAND_NAMES = [
  'bans',
  'cage',
  'channel_settings',
  'channel_stats',
  'check_cages',
  'copy_channel',
  'delwarn',
  'enable_doublexp',
  'global',
  'import_user_rank',
  'remove_cage',
  'settings',
  'unban',
  'update_command_settings',
  'user_settings_xp',
  'warn',
  'warnings',
  'xp_settings',
];

module.exports = {
  modSlashLogicalKey,
  modSlashHash,
  modSlashDisplayName,
  MOD_COMMAND_LOGICAL_KEYS,
  OBSOLETE_MODERATION_COMMAND_NAMES,
};
