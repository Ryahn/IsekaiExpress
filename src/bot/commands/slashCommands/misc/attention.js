const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const {
  canUseAttentionModLane,
  canUseAttentionStaffLane,
  fetchMemberForPrivilegeCheck,
  hasGuildAdminOrStaffRole,
} = require('../../../utils/guildPrivileges');
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
      sub.setName('mod').setDescription('Start an attention request (mod queue; uploaders and trial mods)'),
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
    ),

  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'config') {
      const member = await fetchMemberForPrivilegeCheck(interaction.guild, interaction.user.id);
      if (!hasGuildAdminOrStaffRole(member, client.config.roles.staff)) {
        return interaction.editReply({
          content: 'You need the staff role or Administrator to configure the attention channel.',
          flags: MessageFlags.Ephemeral,
        });
      }

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

    const member = await fetchMemberForPrivilegeCheck(interaction.guild, interaction.user.id);

    if (sub === 'mod') {
      if (!canUseAttentionModLane(member, client.config?.roles)) {
        return interaction.reply({
          content: 'You need the uploader role, trial mod role, or Administrator to use the mod queue.',
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
