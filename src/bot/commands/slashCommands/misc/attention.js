const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const {
  canUseAttentionModLane,
  canUseAttentionStaffLane,
  fetchMemberForPrivilegeCheck,
  hasGuildAdminOrStaffRole,
} = require('../../../utils/guildPrivileges');
const {
  archiveAttentionRequestMessage,
  ensurePrunePermissions,
  getAttentionArchiveChannels,
  missingChannelReason,
} = require('../../../../../libs/attentionArchive');
const { buildAttentionTypeSelectRows } = require('../../../../../libs/attentionFlow');

function typePickerEmbed(lane) {
  const title = lane === 'mod' ? 'Attention (mod queue)' : 'Attention (staff queue)';
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      [
        '**1.** Choose a **request type** below.',
        '**2.** A form opens with the fields that match your choice.',
        '',
        'There is no real checkbox in Discord — if you need an **extra text box** at the bottom of the form, pick an option that says **+ optional notes**.',
      ].join('\n'),
    );
}

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('attention')
    .setDescription('Submit or configure attention requests for mod or staff')
    .addSubcommand((sub) =>
      sub
        .setName('mod')
        .setDescription('Start an attention request (mod queue; staff, mods, uploaders, trial mods)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('staff')
        .setDescription('Start an attention request (staff queue; staff, mods, uploaders, trial mods)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Set the channel where attention requests are posted')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for attention embeds')
            .setRequired(true)
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('archive')
        .setDescription('Set the channel where resolved attention requests are archived')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for resolved attention embeds')
            .setRequired(true)
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('prune')
        .setDescription('Move resolved attention embeds from the queue channel to the archive channel'),
    ),

  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'config' || sub === 'archive' || sub === 'prune') {
      const member = await fetchMemberForPrivilegeCheck(interaction.guild, interaction.user.id);
      if (!hasGuildAdminOrStaffRole(member, client.config.roles.staff)) {
        return interaction.editReply({
          content: 'You need the staff role or Administrator to manage attention channels.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (sub === 'config') {
      const ch = interaction.options.getChannel('channel', true);
      if (!ch.isTextBased()) {
        return interaction.editReply({ content: 'Pick a text-based channel.', flags: MessageFlags.Ephemeral });
      }

      await client.db.query
        .table('GuildConfigurable')
        .where({ guildId: interaction.guildId })
        .update({ attention_channel_id: ch.id });

      return interaction.editReply({
        content: `Attention queue channel set to ${ch}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'archive') {
      const ch = interaction.options.getChannel('channel', true);
      if (!ch.isTextBased()) {
        return interaction.editReply({ content: 'Pick a text-based channel.', flags: MessageFlags.Ephemeral });
      }

      await client.db.query
        .table('GuildConfigurable')
        .where({ guildId: interaction.guildId })
        .update({ attention_archive_channel_id: ch.id });

      return interaction.editReply({
        content: `Attention archive channel set to ${ch}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'prune') {
      const channels = await getAttentionArchiveChannels(client, interaction.guild);
      const channelError = missingChannelReason(channels);
      if (channelError) {
        return interaction.editReply({ content: channelError, flags: MessageFlags.Ephemeral });
      }

      const permissionError = ensurePrunePermissions(channels.queueChannel, channels.archiveChannel);
      if (permissionError) {
        return interaction.editReply({ content: permissionError, flags: MessageFlags.Ephemeral });
      }

      const rows = await client.db.listResolvedUnarchivedAttentionRequests(
        interaction.guildId,
        channels.queueChannel.id,
      );
      if (!rows.length) {
        return interaction.editReply({
          content: 'No resolved attention requests need pruning.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const counts = { archived: 0, missing: 0, skipped: 0, failed: 0 };
      for (const row of rows) {
        const result = await archiveAttentionRequestMessage(client, interaction.guild, row, {
          queueChannel: channels.queueChannel,
          archiveChannel: channels.archiveChannel,
        }).catch((e) => ({ status: 'failed', reason: e?.message || String(e) }));

        if (result.status === 'archived') counts.archived += 1;
        else if (result.status === 'missing') counts.missing += 1;
        else if (result.status === 'skipped') counts.skipped += 1;
        else counts.failed += 1;
      }

      return interaction.editReply({
        content:
          `Attention prune complete: moved ${counts.archived}, ` +
          `missing/deleted ${counts.missing}, skipped ${counts.skipped}, failed ${counts.failed}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const member = await fetchMemberForPrivilegeCheck(interaction.guild, interaction.user.id);

    if (sub === 'mod') {
      if (!canUseAttentionModLane(member, client.config?.roles)) {
        return interaction.reply({
          content:
            'You need the staff role, mod role, uploader role, trial mod role, or Administrator to use the mod queue.',
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        embeds: [typePickerEmbed('mod')],
        components: buildAttentionTypeSelectRows('mod'),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'staff') {
      if (!canUseAttentionStaffLane(member, client.config?.roles)) {
        return interaction.reply({
          content:
            'You need the staff role, mod role, uploader role, trial mod role, or Administrator to use the staff queue.',
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        embeds: [typePickerEmbed('staff')],
        components: buildAttentionTypeSelectRows('staff'),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
