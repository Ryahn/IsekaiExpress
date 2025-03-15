const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('import_user_rank')
        .setDescription("Import a user's rank from an image URL. Be sure to run ?level first to get the rank from ZoneMaster.")
		.addStringOption(option => option.setName('url').setDescription('The url to import the rank from').setRequired(true))
		.addUserOption(option => option.setName('target').setDescription('The user you want to import the rank for').setRequired(true)),

    async execute(client, interaction) {
		const hash = crypto.createHash('md5').update(module.exports.data.name).digest('hex');
		const allowedChannel = await client.db.getAllowedChannel(hash);
		const guild = client.guilds.cache.get(interaction.guild.id);
		const member = await guild.members.fetch(interaction.user.id);
		const roles = member.roles.cache.map(role => role.id);

		if (allowedChannel && (allowedChannel.channel_id === 'all' || allowedChannel.channel_id !== interaction.channel.id)) {
			if (!roles.some(role => client.allowed.includes(role))) {
				return interaction.reply({ 
					content: `This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`, 
					ephemeral: true 
				});
			}
		}

        try {
			if (!interaction.member.permissions.has("ADMINISTRATOR")) {
				await interaction.reply('You do not have permission to use this command.');
				return;
			}
            await interaction.deferReply();
			const imageUrl = interaction.options.getString('url');
			const targetUser = interaction.options.getUser('target');
			let xpValue = null;
			let usernameValue = null;
			let level = null;

			async function downloadImage(url, outputPath) {
			const response = await axios({
				url,
				responseType: 'stream',
			});
			return new Promise((resolve, reject) => {
				response.data.pipe(fs.createWriteStream(outputPath))
				.on('finish', () => resolve())
				.on('error', (e) => reject(e));
			});
			}

			async function cropImage(inputPath, outputPath, x, y, width, height) {
			// Crop the image to the specific area defined by x, y, width, height
			await sharp(inputPath)
				.extract({ left: x, top: y, width: width, height: height })
				.toFile(outputPath);
			}

			function formatXPStringToNumber(xpString) {
			let number = parseFloat(xpString); // Extract the numeric part
			if (xpString.toLowerCase().includes('k')) {
				number *= 1000; // Multiply by 1000 for 'k'
			}
			return number;
			}

			function cleanText(text) {
			// Remove unwanted characters like £, #, and other non-alphanumeric symbols
			return text.replace(/[^\w\s]/gi, '').trim();
			}

			async function extractXPAndUsername() {
			const imagePath = './level_card.png';
			const croppedImagePath = './cropped_level_card.png';
			
			// Step 1: Download the image
			await downloadImage(imageUrl, imagePath);

			// Step 2: Crop the image to the specified area
			const x = 296;  // X-coordinate (starting point on the horizontal axis)
			const y = 63;  // Y-coordinate (starting point on the vertical axis)
			const width = 440;  // Width of the cropped area
			const height = 126;  // Height of the cropped area
			await cropImage(imagePath, croppedImagePath, x, y, width, height);

			// Step 3: Extract XP from the full image
			const xpText = await Tesseract.recognize(
				imagePath,
				'eng',  // Language option
				{
				tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK // Use single block of text to improve accuracy
				}
			).then(({ data: { text } }) => text);
			
			const xpMatch = xpText.match(/\d+\.?\d*k/);  // Regular expression to match XP value (e.g., 16.0k)
			xpValue = xpMatch ? formatXPStringToNumber(xpMatch[0]) : null;

			// Step 4: Extract username from the cropped image
			const usernameText = await Tesseract.recognize(
				croppedImagePath,
				'eng',  // Language option
			).then(({ data: { text } }) => text);
			
			const lines = usernameText.split('\n').map(line => cleanText(line)).filter(Boolean);
			usernameValue = lines.length > 0 ? lines[0] : 'Username not found';

			// Cleanup: Delete the downloaded image and cropped image after processing
			fs.unlinkSync(imagePath);
			fs.unlinkSync(croppedImagePath);
			
			// Return the values
			return { xpValue, usernameValue };
			}

			// Run the function and log the result after OCR is complete
			extractXPAndUsername().then(async ({ xpValue, usernameValue }) => {
				xpValue = Number(xpValue);

				if (xpValue && usernameValue) {
					if (targetUser.username === usernameValue) {

						level = client.utils.calculateLevel(xpValue);
						await client.db.updateUserXP(targetUser.id, xpValue, 0, level);

						await interaction.followUp(`Imported XP: ${xpValue}\nImported Level: ${level}\nImported for ${targetUser}`);
					} else {
						await interaction.followUp('Username and XP values do not match. Please try again.');
					}
				} else {
					await interaction.followUp('Failed to extract XP or username. Please try again.');
				}
			});
        } catch (error) {
            client.logger.error('Error executing the blush command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};

