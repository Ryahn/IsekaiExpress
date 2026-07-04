const BaseCommand = require('../../../../utils/structures/BaseCommand');
const { EmbedBuilder } = require('discord.js');
const { fetchRandomImage, MIME_PRESETS } = require('../../../../utils/theCatApi');

const STATIC_ALIASES = new Set(['static', 'img', 'image', 'pic', 'photo']);

function resolveMimeTypes(args) {
  const mode = (args[0] || 'gif').toLowerCase();
  if (mode === 'gif') return MIME_PRESETS.gif;
  if (STATIC_ALIASES.has(mode)) return MIME_PRESETS.static;
  return MIME_PRESETS.gif;
}

module.exports = class Cat extends BaseCommand {
  constructor() {
    super('cat', 'fun', ['kitty', 'meow']);
  }

  async run(client, message, args) {
    const mimeTypes = resolveMimeTypes(args);

    try {
      const image = await client.rateLimitHandler.executeWithRateLimit('the-cat-api', async () => {
        return fetchRandomImage({
          mimeTypes,
          apiKey: client.config.theCatApi.apiKey,
        });
      });

      const embed = new EmbedBuilder()
        .setColor(0xf5a623)
        .setTitle('Random cat')
        .setImage(image.url)
        .setFooter({ text: 'Usage: !cat for gif or !cat [static | img | image | pic | photo] for static image' });
      

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      client.logger.error('Error executing the cat command:', error);
      await message.reply('Something went wrong while fetching a cat.');
    }
  }
};
