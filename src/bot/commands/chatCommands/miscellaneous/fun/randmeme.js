const BaseCommand = require('../../../../utils/structures/BaseCommand');
const { EmbedBuilder } = require('discord.js');
const { memeUrl, pickRandomMeme, isVideoMeme } = require('../../../../utils/f95Memes');

module.exports = class RandMeme extends BaseCommand {
  constructor() {
    super('randmeme', 'fun', ['meme', 'f95meme']);
  }

  async run(client, message) {
    try {
      const filename = pickRandomMeme();
      const url = memeUrl(filename);

      if (isVideoMeme(filename)) {
        await message.channel.send(url);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Random F95 meme')
        .setImage(url);

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      client.logger.error('Error executing the randmeme command:', error);
      await message.reply('Something went wrong while fetching a meme.');
    }
  }
};
