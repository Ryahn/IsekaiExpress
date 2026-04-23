const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js');
const path = require('path');
const { parseWhitelistJson, updateGuildGlobalLockCache } = require('../../../middleware/globalCommandLock');

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('global')
    .setDescription('Server-wide command lock: restrict commands to a whitelist of channels')
    .addSubcommandGroup((group) =>
      group
        .setName('command')
        .setDescription('Enable or disable global command lock')
        .addSubcommand((sub) =>
          sub
            .setName('on')
            .setDescription('Allow commands in all channels (turn lock off)')
        )
        .addSubcommand((sub) =>
          sub
            .setName('off')
            .setDescription('Only allow non-staff commands in the whitelist below')
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure whitelist')
        .addSubcommand((sub) =>
          sub
            .setName('whitelist')
            .setDescription('Set which channel is allowed when global lock is on')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Channel where commands work when lock is on')
                .setRequired(true)
            )
        )
    ),

  async execute(client, interaction) {
    if (!interaction.inGuild()) {
      return interaction.editReply({ content: 'This command can only be used in a server.', ephemeral: true });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: 'You need Administrator permission.', ephemeral: true });
    }

    const guildId = interaction.guildId;
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (subcommandGroup === 'command' && (sub === 'on' || sub === 'off')) {
      if (sub === 'on') {
        await client.db.updateGuildGlobalCommandLock(guildId, { locked: false });
        const row = await client.db.getGuildConfigurable(guildId);
        updateGuildGlobalLockCache(
          client,
          guildId,
          false,
          parseWhitelistJson(row?.global_commands_whitelist_channel_ids)
        );
        return interaction.editReply('Global command lock is **off**. Commands work in all channels (subject to per-command settings).');
      }
      if (sub === 'off') {
        const row = await client.db.getGuildConfigurable(guildId);
        const channelIds = parseWhitelistJson(row?.global_commands_whitelist_channel_ids);
        if (!channelIds.length) {
          return interaction.editReply({
            content:
              'Set a whitelist first: `/global config whitelist` with a channel, then run `/global command off` again.',
            ephemeral: true
          });
        }
        await client.db.updateGuildGlobalCommandLock(guildId, { locked: true, whitelistChannelIds: channelIds });
        updateGuildGlobalLockCache(client, guildId, true, channelIds);
        return interaction.editReply(
          `Global command lock is **on**. Public commands are limited to: ${channelIds
            .map((id) => `<#${id}>`)
            .join(', ')}`
        );
      }
    }

    if (subcommandGroup === 'config' && sub === 'whitelist') {
      const channel = interaction.options.getChannel('channel', true);
      const id = [channel.id];
      await client.db.updateGuildGlobalCommandLock(guildId, { whitelistChannelIds: id });
      const row = await client.db.getGuildConfigurable(guildId);
      updateGuildGlobalLockCache(
        client,
        guildId,
        Boolean(row?.global_commands_locked),
        id
      );
      return interaction.editReply(
        `Whitelist set to <#${channel.id}>. Use \`/global command off\` to enforce lock.`
      );
    }

    return interaction.editReply({ content: 'Invalid subcommand.', ephemeral: true });
  }
};
