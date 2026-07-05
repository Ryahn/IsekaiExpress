const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const path = require('path');
const config = require('../../../../../config');
const {
  channelIsNsfw,
  resolveChannel,
  fetchImageForInteraction,
  getCachedTypes,
  filterAutocompleteTypes,
  pickRandomPerson,
} = require('../../../utils/imgApi');

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('furry')
    .setDescription('furry reaction gif or image')
    .addStringOption((opt) =>
      opt.setName('type').setDescription('Furry type').setRequired(true).setAutocomplete(true),
    )
    .addUserOption((opt) => opt.setName('target').setDescription('The user to target')),

  async autocomplete(client, interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'type') {
      await interaction.respond([]);
      return;
    }

    try {
      if (!config.imgApi.apiKey) {
        await interaction.respond([]);
        return;
      }
      const types = await getCachedTypes('furry', config.imgApi.apiKey);
      await interaction.respond(filterAutocompleteTypes(types, focused.value));
    } catch (error) {
      client.logger.error('furry autocomplete failed:', error);
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(client, interaction) {
    const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'furry');
    if (cooldownTime) {
      return interaction.editReply({
        content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!config.imgApi.apiKey) {
      return interaction.editReply({
        content: 'This command needs `IMG_API_KEY` in the environment.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = await resolveChannel(client, interaction);
    if (!channelIsNsfw(channel)) {
      return interaction.editReply('This command can only be used in NSFW channels!');
    }

    const type = interaction.options.getString('type', true);
    const targetUser = interaction.options.getUser('target');
    const targetLabel = targetUser ? `${targetUser}` : pickRandomPerson();
    const { getRandomColor } = client.utils;

    try {
      const data = await fetchImageForInteraction(client, { category: 'furry', type });
      const embed = new EmbedBuilder()
        .setDescription(`${interaction.user} sends ${type} to ${targetLabel}`)
        .setColor(`#${getRandomColor()}`)
        .setImage(data.url);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      client.logger.error('Error executing the furry command:', error);
      const payload = {
        content: 'Could not load the image (the external API may be down or changed).',
        flags: MessageFlags.Ephemeral,
      };
      try {
        await interaction.editReply(payload);
      } catch {
        await interaction.followUp(payload).catch(() => {});
      }
    }
  },
};
