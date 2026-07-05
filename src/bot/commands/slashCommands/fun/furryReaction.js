const { SlashCommandBuilder } = require('@discordjs/builders');
const {
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
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

const LIST_PAGE_SIZE = 20;
const PAGINATION_TIME_MS = 300000;

function paginateTypes(types, pageSize = LIST_PAGE_SIZE) {
  const pages = [];
  for (let i = 0; i < types.length; i += pageSize) {
    pages.push(types.slice(i, i + pageSize));
  }
  return pages;
}

function buildListEmbed(types, pageIndex, totalPages) {
  const chunk = paginateTypes(types)[pageIndex] || [];
  const lines = chunk.map((type) => `\`${type}\``);

  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`Furry types (${types.length} total)`)
    .setDescription(lines.join('\n') || 'No types found.')
    .setFooter({
      text: `Page ${pageIndex + 1}/${totalPages} • /furry send type:<name>`,
    });
}

function buildListButtons(pageIndex, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('furry_list_prev')
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pageIndex === 0),
    new ButtonBuilder()
      .setCustomId('furry_list_next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pageIndex >= totalPages - 1),
  );
}

async function handleList(client, interaction) {
  if (!config.imgApi.apiKey) {
    return interaction.editReply({
      content: 'This command needs `IMG_API_KEY` in the environment.',
      flags: MessageFlags.Ephemeral,
    });
  }

  let types;
  try {
    types = await getCachedTypes('furry', config.imgApi.apiKey);
  } catch (error) {
    client.logger.error('furry list failed:', error);
    return interaction.editReply({
      content: 'Could not load furry types from the Image API.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const pages = paginateTypes(types);
  const totalPages = pages.length || 1;
  const requestedPage = interaction.options.getInteger('page') || 1;
  let currentPage = Math.min(Math.max(requestedPage - 1, 0), totalPages - 1);

  const payload = {
    embeds: [buildListEmbed(types, currentPage, totalPages)],
    components: totalPages > 1 ? [buildListButtons(currentPage, totalPages)] : [],
  };

  await interaction.editReply(payload);

  if (totalPages <= 1) return;

  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({
    filter: (btn) => btn.user.id === interaction.user.id,
    time: PAGINATION_TIME_MS,
  });

  collector.on('collect', async (btn) => {
    if (btn.customId === 'furry_list_prev') {
      currentPage = Math.max(0, currentPage - 1);
    } else if (btn.customId === 'furry_list_next') {
      currentPage = Math.min(totalPages - 1, currentPage + 1);
    }

    await btn.update({
      embeds: [buildListEmbed(types, currentPage, totalPages)],
      components: [buildListButtons(currentPage, totalPages)],
    });
  });

  collector.on('end', () => {
    message.edit({ components: [] }).catch(() => undefined);
  });
}

async function handleSend(client, interaction) {
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

  let knownTypes;
  try {
    knownTypes = await getCachedTypes('furry', config.imgApi.apiKey);
  } catch (error) {
    client.logger.error('furry type validation failed:', error);
    knownTypes = null;
  }

  if (knownTypes && !knownTypes.includes(type)) {
    const suggestions = filterAutocompleteTypes(knownTypes, type, 5).map((c) => `\`${c.value}\``);
    const hint = suggestions.length
      ? `Did you mean: ${suggestions.join(', ')}? Use \`/furry list\` to browse all types.`
      : 'Use `/furry list` to browse all available types.';
    return interaction.editReply({
      content: `Unknown furry type \`${type}\`. ${hint}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const data = await fetchImageForInteraction(client, { category: 'furry', type });
    const embed = new EmbedBuilder()
      .setDescription(`${interaction.user} sends ${type} to ${targetLabel}`)
      .setColor(`#${getRandomColor()}`)
      .setImage(data.url);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    client.logger.error('Error executing the furry send command:', error);
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
}

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('furry')
    .setDescription('Furry reaction images')
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Send a furry reaction gif or image')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Start typing to search types, or use /furry list to browse all')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((opt) => opt.setName('target').setDescription('The user to target')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all furry types (paginated)')
        .addIntegerOption((opt) =>
          opt
            .setName('page')
            .setDescription('Page number to start on')
            .setMinValue(1),
        ),
    ),

  async autocomplete(client, interaction) {
    if (interaction.options.getSubcommand(false) !== 'send') {
      await interaction.respond([]);
      return;
    }

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
    const sub = interaction.options.getSubcommand(true);
    if (sub === 'list') {
      return handleList(client, interaction);
    }
    return handleSend(client, interaction);
  },
};
