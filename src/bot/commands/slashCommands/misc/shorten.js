const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { shortenUrlWithZurl } = require('../../../../../libs/zurlShorten');

function normalizeHttpUrl(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) return null;

  if (url.startsWith('<') && url.endsWith('>')) {
    url = url.slice(1, -1).trim();
  }

  url = url.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '').trim();
  if (!/^https?:\/\//i.test(url)) return null;

  try {
    return new URL(url).href;
  } catch {
    return null;
  }
}

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('shorten')
    .setDescription('Shorten URLs with the attention queue shortener')
    .addSubcommand((sub) =>
      sub
        .setName('url')
        .setDescription('Shorten a URL')
        .addStringOption((option) =>
          option
            .setName('url')
            .setDescription('The URL to shorten')
            .setRequired(true),
        ),
    ),

  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand(true);
    if (sub !== 'url') return;

    const normalizedUrl = normalizeHttpUrl(interaction.options.getString('url', true));
    if (!normalizedUrl) {
      return interaction.editReply('Please provide a valid `http://` or `https://` URL.');
    }

    const apiKey = String(client.config?.zurl?.apiKey || '').trim();
    if (!apiKey) {
      return interaction.editReply('The URL shortener is not configured.');
    }

    const shortenedUrl = await shortenUrlWithZurl(apiKey, normalizedUrl);
    if (shortenedUrl === normalizedUrl) {
      return interaction.editReply('I could not shorten that URL. Please try again later.');
    }

    return interaction.editReply(shortenedUrl);
  },
};
