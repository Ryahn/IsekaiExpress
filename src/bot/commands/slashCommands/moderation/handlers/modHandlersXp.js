const { EmbedBuilder } = require('discord.js');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');

async function xpSettingsExecute(client, interaction) {
  if (!interaction.member.permissions.has('ADMINISTRATOR')) {
    return interaction.editReply({ content: 'You do not have permission to change XP settings.', ephemeral: true });
  }

  const { getRandomColor } = client.utils;

  const guildId = interaction.guildId;
  const xpSettings = await client.db.getXPSettings(guildId);
  const data = {
    messages_per_xp: Number(xpSettings.messages_per_xp),
    weekend_multiplier: Number(xpSettings.weekend_multiplier),
    min_xp_per_gain: Number(xpSettings.min_xp_per_gain),
    max_xp_per_gain: Number(xpSettings.max_xp_per_gain),
    weekend_days: String(xpSettings.weekend_days),
  };

  if (interaction.options.getString('messages_per_xp')) {
    data.messages_per_xp = Number(interaction.options.getString('messages_per_xp'));
  }

  if (interaction.options.getString('xp_multiplier')) {
    data.weekend_multiplier = Number(interaction.options.getString('xp_multiplier'));
  }

  if (interaction.options.getString('min_xp_per_message')) {
    data.min_xp_per_gain = Number(interaction.options.getString('min_xp_per_message'));
  }

  if (interaction.options.getString('max_xp_per_message')) {
    data.max_xp_per_gain = Number(interaction.options.getString('max_xp_per_message'));
  }

  if (interaction.options.getString('double_xp_days')) {
    const doubleXpDaysValue = interaction.options.getString('double_xp_days');
    const days = doubleXpDaysValue.split(',').map((day) => day.toLowerCase()).join(',');
    data.weekend_days = String(days);
  }

  await client.db.updateXPSettings(data, guildId);
  const fields = [
    { name: 'Messages Per XP', value: String(data.messages_per_xp) || 'Not set' },
    { name: 'XP Multiplier', value: String(data.weekend_multiplier) || 'Not set' },
    { name: 'Min XP Per Message', value: String(data.min_xp_per_gain) || 'Not set' },
    { name: 'Max XP Per Message', value: String(data.max_xp_per_gain) || 'Not set' },
    { name: 'Double XP Days', value: String(data.weekend_days) || 'Not set' },
  ];

  const embed = new EmbedBuilder()
    .setDescription('XP settings have been updated')
    .setColor(`#${getRandomColor()}`)
    .addFields(...fields);

  await interaction.followUp({ embeds: [embed] });
}

async function xpUserExecute(client, interaction) {
  const { getRandomColor } = client.utils;
  const option = interaction.options.getString('option');
  const user = interaction.options.getUser('target');
  const amount = interaction.options.getInteger('amount');

  if (!user || amount == null) {
    return interaction.editReply({ content: 'User and amount are required.', ephemeral: true });
  }

  try {
    let optionName = '';
    const u = await client.db.getUserXP(user.id);
    let xp = Number(u.xp) || 0;
    let level = Number(u.level) || 1;
    const msgCount = Number(u.message_count) || 0;

    switch (option) {
      case 'add_xp':
        optionName = 'Add XP';
        xp += amount;
        level = client.utils.calculateLevel(xp);
        break;
      case 'remove_xp':
        optionName = 'Remove XP';
        xp = Math.max(0, xp - amount);
        level = client.utils.calculateLevel(xp);
        break;
      case 'set_xp':
        optionName = 'Set XP';
        xp = amount;
        level = client.utils.calculateLevel(xp);
        break;
      case 'set_level':
        optionName = 'Set Level';
        level = amount;
        break;
      default:
        return interaction.editReply({ content: 'Invalid option.', ephemeral: true });
    }

    await client.db.updateUserXPAndLevel(user.id, xp, level, msgCount);

    const embed = new EmbedBuilder()
      .setDescription(`${user} has been updated`)
      .setColor(`#${getRandomColor()}`)
      .addFields(
        { name: 'Option', value: optionName },
        { name: 'Amount', value: String(amount) },
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    client.logger.error('Error in mod xp user:', error);
    await interaction.editReply('An error occurred while processing your request.');
  }
}

async function xpDoubleExecute(client, interaction) {
  try {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
      return interaction.followUp('You do not have permission to enable double XP.');
    }

    const guildId = interaction.guildId;
    const settings = await client.db.getXPSettings(guildId);
    const newState = !settings.double_xp_enabled;

    await client.db.toggleDoubleXP(newState, guildId);
    await interaction.followUp(`Double XP is now ${newState ? 'enabled' : 'disabled'}.`);
  } catch (error) {
    client.logger.error('Error executing the enable_doubleXP command:', error);
    if (!interaction.replied) {
      await interaction.editReply('Something went wrong.');
    }
  }
}

async function xpImportRankExecute(client, interaction) {
  try {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
      await interaction.editReply('You do not have permission to use this command.');
      return;
    }

    const imageUrl = interaction.options.getString('url');
    const targetUser = interaction.options.getUser('target');
    let xpValue = null;
    let usernameValue = null;

    async function downloadImage(url, outputPath) {
      const response = await axios({
        url,
        responseType: 'stream',
      });
      return new Promise((resolve, reject) => {
        response.data
          .pipe(fs.createWriteStream(outputPath))
          .on('finish', () => resolve())
          .on('error', (e) => reject(e));
      });
    }

    async function cropImage(inputPath, outputPath, x, y, width, height) {
      await sharp(inputPath).extract({ left: x, top: y, width, height }).toFile(outputPath);
    }

    function formatXPStringToNumber(xpString) {
      let number = parseFloat(xpString);
      if (xpString.toLowerCase().includes('k')) {
        number *= 1000;
      }
      return number;
    }

    function cleanText(text) {
      return text.replace(/[^\w\s]/gi, '').trim();
    }

    async function extractXPAndUsername() {
      const imagePath = './level_card.png';
      const croppedImagePath = './cropped_level_card.png';

      await downloadImage(imageUrl, imagePath);

      const x = 296;
      const y = 63;
      const width = 440;
      const height = 126;
      await cropImage(imagePath, croppedImagePath, x, y, width, height);

      const xpText = await Tesseract.recognize(imagePath, 'eng', {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      }).then(({ data: { text } }) => text);

      const xpMatch = xpText.match(/\d+\.?\d*k/);
      xpValue = xpMatch ? formatXPStringToNumber(xpMatch[0]) : null;

      const usernameText = await Tesseract.recognize(croppedImagePath, 'eng').then(({ data: { text } }) => text);

      const lines = usernameText.split('\n').map((line) => cleanText(line)).filter(Boolean);
      usernameValue = lines.length > 0 ? lines[0] : 'Username not found';

      fs.unlinkSync(imagePath);
      fs.unlinkSync(croppedImagePath);

      return { xpValue, usernameValue };
    }

    extractXPAndUsername().then(async ({ xpValue: xv, usernameValue: uv }) => {
      const numXp = Number(xv);

      if (numXp && uv) {
        if (targetUser.username === uv) {
          const level = client.utils.calculateLevel(numXp);
          await client.db.updateUserXP(targetUser.id, numXp, 0, level);

          await interaction.followUp(
            `Imported XP: ${numXp}\nImported Level: ${level}\nImported for ${targetUser}`,
          );
        } else {
          await interaction.followUp('Username and XP values do not match. Please try again.');
        }
      } else {
        await interaction.followUp('Failed to extract XP or username. Please try again.');
      }
    });
  } catch (error) {
    client.logger.error('Error executing import_user_rank:', error);
    if (!interaction.replied) {
      await interaction.editReply('Something went wrong.');
    }
  }
}

module.exports = {
  xpSettingsExecute,
  xpUserExecute,
  xpDoubleExecute,
  xpImportRankExecute,
};
