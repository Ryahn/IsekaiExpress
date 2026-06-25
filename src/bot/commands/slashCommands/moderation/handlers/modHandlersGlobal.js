const { MessageFlags } = require('discord.js');
const { parseWhitelistJson, updateGuildGlobalLockCache } = require('../../../../middleware/globalCommandLock');
const { requireStaff } = require('../../../../utils/permissionGuards');

async function globalLockOnExecute(client, interaction) {
  if (!(await requireStaff(client, interaction))) return;

  const guildId = interaction.guildId;
  await client.db.updateGuildGlobalCommandLock(guildId, { locked: false });
  const row = await client.db.getGuildConfigurable(guildId);
  updateGuildGlobalLockCache(
    client,
    guildId,
    false,
    parseWhitelistJson(row?.global_commands_whitelist_channel_ids),
  );
  return interaction.editReply(
    'Global command lock is **off**. Commands work in all channels (subject to per-command settings).',
  );
}

async function globalLockOffExecute(client, interaction) {
  if (!(await requireStaff(client, interaction))) return;

  const guildId = interaction.guildId;
  const row = await client.db.getGuildConfigurable(guildId);
  const channelIds = parseWhitelistJson(row?.global_commands_whitelist_channel_ids);
  if (!channelIds.length) {
    return interaction.editReply({
      content:
        'Set a whitelist first: `/mod global whitelist` with a channel, then run `/mod global lock_off` again.',
      flags: MessageFlags.Ephemeral,
    });
  }
  await client.db.updateGuildGlobalCommandLock(guildId, { locked: true, whitelistChannelIds: channelIds });
  updateGuildGlobalLockCache(client, guildId, true, channelIds);
  return interaction.editReply(
    `Global command lock is **on**. Public commands are limited to: ${channelIds.map((id) => `<#${id}>`).join(', ')}`,
  );
}

async function globalWhitelistExecute(client, interaction) {
  if (!(await requireStaff(client, interaction))) return;

  const guildId = interaction.guildId;
  const channel = interaction.options.getChannel('channel', true);
  const id = [channel.id];
  await client.db.updateGuildGlobalCommandLock(guildId, { whitelistChannelIds: id });
  const row = await client.db.getGuildConfigurable(guildId);
  updateGuildGlobalLockCache(client, guildId, Boolean(row?.global_commands_locked), id);
  return interaction.editReply(`Whitelist set to <#${channel.id}>. Use \`/mod global lock_off\` to enforce lock.`);
}

module.exports = {
  globalLockOnExecute,
  globalLockOffExecute,
  globalWhitelistExecute,
};
