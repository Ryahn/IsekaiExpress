const BaseCommand = require('../../../../utils/structures/BaseCommand');
const {
  pickRandomMeme,
  resolveMemeQuery,
  buildMemeListEmbed,
  buildMemeListButtons,
  paginateMemeLines,
  sendMemeToChannel,
  LIST_PAGE_SIZE,
  PAGINATION_TIME_MS,
} = require('../../../../utils/f95Memes');

async function handleMemeList(message, prefix) {
  const pages = paginateMemeLines();
  const totalPages = pages.length;
  let currentPage = 0;
  const footerHint = `Use ${prefix}meme <number> or ${prefix}meme <filename>`;

  const response = await message.reply({
    embeds: [buildMemeListEmbed(currentPage, totalPages, footerHint)],
    components: totalPages > 1 ? [buildMemeListButtons(currentPage, totalPages)] : [],
  });

  if (totalPages <= 1) return;

  const collector = response.createMessageComponentCollector({
    filter: (interaction) => interaction.user.id === message.author.id,
    time: PAGINATION_TIME_MS,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.customId === 'meme_list_prev') {
      currentPage = Math.max(0, currentPage - 1);
    } else if (interaction.customId === 'meme_list_next') {
      currentPage = Math.min(totalPages - 1, currentPage + 1);
    }

    await interaction.update({
      embeds: [buildMemeListEmbed(currentPage, totalPages, footerHint)],
      components: [buildMemeListButtons(currentPage, totalPages)],
    });
  });

  collector.on('end', () => {
    response.edit({ components: [] }).catch(() => undefined);
  });
}

module.exports = class RandMeme extends BaseCommand {
  constructor() {
    super('randmeme', 'fun', ['meme', 'f95meme']);
  }

  async run(client, message, args) {
    const prefix = client.config.discord.prefix || '!';

    try {
      if (args[0]?.toLowerCase() === 'list') {
        await handleMemeList(message, prefix);
        return;
      }

      if (args.length > 0) {
        const query = args.join(' ');
        const resolved = resolveMemeQuery(query);

        if (!resolved) {
          await message.reply(`No meme found for \`${query}\`. Use \`${prefix}meme list\` to browse all memes.`);
          return;
        }

        if (resolved.ambiguous) {
          const sample = resolved.ambiguous.slice(0, 10).map((name) => `\`${name}\``).join('\n');
          const extra = resolved.ambiguous.length > 10
            ? `\n...and ${resolved.ambiguous.length - 10} more.`
            : '';
          await message.reply(`Multiple memes match \`${query}\`:\n${sample}${extra}`);
          return;
        }

        await sendMemeToChannel(message, resolved.filename);
        return;
      }

      await sendMemeToChannel(message, pickRandomMeme(), 'Random F95 meme');
    } catch (error) {
      client.logger.error('Error executing the randmeme command:', error);
      await message.reply('Something went wrong while fetching a meme.');
    }
  }
};
