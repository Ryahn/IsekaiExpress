const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const path = require('path');
const {
  pickRandomMeme,
  resolveMemeQuery,
  paginateMemeLines,
  buildMemeListEmbed,
  buildMemeListButtons,
  sendMemeToInteraction,
  filterAutocompleteMemes,
  PAGINATION_TIME_MS,
} = require('../../../utils/f95Memes');

async function handleRandom(interaction) {
  await sendMemeToInteraction(interaction, pickRandomMeme(), 'Random F95 meme');
}

async function handleSend(interaction) {
  const query = interaction.options.getString('name', true);
  const resolved = resolveMemeQuery(query);

  if (!resolved) {
    return interaction.editReply({
      content: `No meme found for \`${query}\`. Use \`/meme list\` to browse all memes.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (resolved.ambiguous) {
    const sample = resolved.ambiguous.slice(0, 10).map((name) => `\`${name}\``).join('\n');
    const extra = resolved.ambiguous.length > 10
      ? `\n...and ${resolved.ambiguous.length - 10} more.`
      : '';
    return interaction.editReply({
      content: `Multiple memes match \`${query}\`:\n${sample}${extra}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await sendMemeToInteraction(interaction, resolved.filename);
}

async function handleList(client, interaction) {
  const pages = paginateMemeLines();
  const totalPages = pages.length || 1;
  const requestedPage = interaction.options.getInteger('page') || 1;
  let currentPage = Math.min(Math.max(requestedPage - 1, 0), totalPages - 1);
  const footerHint = '/meme send name:<filename>';

  const payload = {
    embeds: [buildMemeListEmbed(currentPage, totalPages, footerHint)],
    components: totalPages > 1 ? [buildMemeListButtons(currentPage, totalPages)] : [],
  };

  await interaction.editReply(payload);

  if (totalPages <= 1) return;

  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({
    filter: (btn) => btn.user.id === interaction.user.id,
    time: PAGINATION_TIME_MS,
  });

  collector.on('collect', async (btn) => {
    if (btn.customId === 'meme_list_prev') {
      currentPage = Math.max(0, currentPage - 1);
    } else if (btn.customId === 'meme_list_next') {
      currentPage = Math.min(totalPages - 1, currentPage + 1);
    }

    await btn.update({
      embeds: [buildMemeListEmbed(currentPage, totalPages, footerHint)],
      components: [buildMemeListButtons(currentPage, totalPages)],
    });
  });

  collector.on('end', () => {
    message.edit({ components: [] }).catch(() => undefined);
  });
}

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('F95 community memes')
    .addSubcommand((sub) =>
      sub
        .setName('random')
        .setDescription('Send a random F95 meme'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Send a specific meme by name or number')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Start typing to search memes, or use /meme list to browse all')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all F95 memes (paginated)')
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
    if (focused.name !== 'name') {
      await interaction.respond([]);
      return;
    }

    try {
      const choices = filterAutocompleteMemes(focused.value);
      await interaction.respond(
        choices.map((choice) => ({ name: choice.name.slice(0, 100), value: choice.value.slice(0, 100) })),
      );
    } catch (error) {
      client.logger.error('meme autocomplete failed:', error);
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand(true);
    if (sub === 'list') {
      return handleList(client, interaction);
    }
    if (sub === 'send') {
      return handleSend(interaction);
    }
    return handleRandom(interaction);
  },
};
