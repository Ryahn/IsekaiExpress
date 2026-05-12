const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');
const {
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../../../utils/guildPrivileges');

function canOpenModModal(member, client) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const mod = typeof client.config?.roles?.mod === 'string' ? client.config.roles.mod.trim() : '';
  const up =
    typeof client.config?.roles?.uploader === 'string' ? client.config.roles.uploader.trim() : '';
  if (mod && member.roles.cache.has(mod)) return true;
  if (up && member.roles.cache.has(up)) return true;
  return false;
}

function buildAttentionModal(lane) {
  const title = lane === 'mod' ? 'Attention (mod queue)' : 'Attention (staff queue)';
  const thread = new TextInputBuilder()
    .setCustomId('attention_thread')
    .setLabel('Thread URL')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(4)
    .setMaxLength(2000)
    .setRequired(true);

  const profile = new TextInputBuilder()
    .setCustomId('attention_profile')
    .setLabel('Member profile URL')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(4)
    .setMaxLength(2000)
    .setRequired(true);

  const reason = new TextInputBuilder()
    .setCustomId('attention_reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(4000)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`attention:form:${lane}`)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(thread),
      new ActionRowBuilder().addComponents(profile),
      new ActionRowBuilder().addComponents(reason),
    );
}

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('attention')
    .setDescription('Submit or configure attention requests for mod or staff')
    .addSubcommand((sub) =>
      sub.setName('mod').setDescription('Open the attention form (mod queue; mods and uploaders)'),
    )
    .addSubcommand((sub) =>
      sub.setName('staff').setDescription('Open the attention form (staff queue; staff only)'),
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
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!hasGuildAdminOrStaffRole(member, client.config.roles.staff)) {
        return interaction.editReply({
          content: 'You need the staff role or Administrator to configure the attention channel.',
          ephemeral: true,
        });
      }

      const ch = interaction.options.getChannel('channel', true);
      if (!ch.isTextBased()) {
        return interaction.editReply({ content: 'Pick a text-based channel.', ephemeral: true });
      }

      await client.db.query
        .table('GuildConfigurable')
        .where({ guildId: interaction.guildId })
        .update({ attention_channel_id: ch.id });

      return interaction.editReply({
        content: `Attention queue channel set to ${ch}.`,
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (sub === 'mod') {
      if (!canOpenModModal(member, client)) {
        return interaction.reply({
          content: 'You need the mod role, uploader role, or Administrator to use the mod queue.',
          ephemeral: true,
        });
      }
      return interaction.showModal(buildAttentionModal('mod'));
    }

    if (sub === 'staff') {
      if (!hasGuildAdminOrStaffRole(member, client.config.roles.staff)) {
        return interaction.reply({
          content: 'You need the staff role or Administrator to use the staff queue.',
          ephemeral: true,
        });
      }
      return interaction.showModal(buildAttentionModal('staff'));
    }
  },
};
