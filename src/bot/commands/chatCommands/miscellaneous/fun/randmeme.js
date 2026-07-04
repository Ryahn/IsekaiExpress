const BaseCommand = require('../../../../utils/structures/BaseCommand');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const {
  MEME_FILES,
  memeUrl,
  pickRandomMeme,
  isVideoMeme,
  resolveMemeQuery,
} = require('../../../../utils/f95Memes');

const LIST_PAGE_SIZE = 20;
const PAGINATION_TIME_MS = 300000;

async function sendMeme(message, filename, title = 'F95 meme') {
  const url = memeUrl(filename);

  if (isVideoMeme(filename)) {
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(title)
      .setDescription(filename);

    await message.channel.send({ content: url, embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(title)
    .setDescription(filename)
    .setImage(url);

  await message.channel.send({ embeds: [embed] });
}

async function handleMemeList(message, prefix) {
  const lines = MEME_FILES.map((name, index) => {
    const num = String(index + 1).padStart(3, ' ');
    return `\`${num}\` [${name}](${memeUrl(name)})`;
  });
  const pages = [];

  for (let i = 0; i < lines.length; i += LIST_PAGE_SIZE) {
    pages.push(lines.slice(i, i + LIST_PAGE_SIZE));
  }

  let currentPage = 0;
  const totalPages = pages.length;

  const createEmbed = (page) => new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`F95 memes (${MEME_FILES.length} total)`)
    .setDescription(pages[page].join('\n'))
    .setFooter({
      text: `Page ${page + 1}/${totalPages} | Use ${prefix}meme <number> or ${prefix}meme <filename>`,
    });

  const createButtons = (page) => new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('meme_list_prev')
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('meme_list_next')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages - 1),
    );

  const response = await message.reply({
    embeds: [createEmbed(currentPage)],
    components: totalPages > 1 ? [createButtons(currentPage)] : [],
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
      embeds: [createEmbed(currentPage)],
      components: [createButtons(currentPage)],
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

        await sendMeme(message, resolved.filename);
        return;
      }

      await sendMeme(message, pickRandomMeme(), 'Random F95 meme');
    } catch (error) {
      client.logger.error('Error executing the randmeme command:', error);
      await message.reply('Something went wrong while fetching a meme.');
    }
  }
};
