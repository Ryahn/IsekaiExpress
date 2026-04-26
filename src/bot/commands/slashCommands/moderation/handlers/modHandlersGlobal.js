const { parseWhitelistJson, updateGuildGlobalLockCache } = require('../../../../middleware/globalCommandLock');
const { hasGuildAdminOrStaffRole } = require('../../../../utils/guildPrivileges');

async function globalLockOnExecute(client, interaction) {
  if (!interaction.inGuild()) {
    return interaction.editReply({ content: 'This command can only be used in a server.', ephemeral: true });
  }
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    return interaction.editReply({
      content: 'You need Administrator permission or the configured staff role.',
      ephemeral: true,
    });
  }

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
  if (!interaction.inGuild()) {
    return interaction.editReply({ content: 'This command can only be used in a server.', ephemeral: true });
  }
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    return interaction.editReply({
      content: 'You need Administrator permission or the configured staff role.',
      ephemeral: true,
    });
  }

  const guildId = interaction.guildId;
  const row = await client.db.getGuildConfigurable(guildId);
  const channelIds = parseWhitelistJson(row?.global_commands_whitelist_channel_ids);
  if (!channelIds.length) {
    return interaction.editReply({
      content:
        'Set a whitelist first: `/mod global whitelist` with a channel, then run `/mod global lock_off` again.',
      ephemeral: true,
    });
  }
  await client.db.updateGuildGlobalCommandLock(guildId, { locked: true, whitelistChannelIds: channelIds });
  updateGuildGlobalLockCache(client, guildId, true, channelIds);
  return interaction.editReply(
    `Global command lock is **on**. Public commands are limited to: ${channelIds.map((id) => `<#${id}>`).join(', ')}`,
  );
}

async function globalWhitelistExecute(client, interaction) {
  if (!interaction.inGuild()) {
    return interaction.editReply({ content: 'This command can only be used in a server.', ephemeral: true });
  }
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    return interaction.editReply({
      content: 'You need Administrator permission or the configured staff role.',
      ephemeral: true,
    });
  }

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
