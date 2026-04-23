const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const { getCardImageFolderName } = require('../../../../../libs/cardImageUrl');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('get_card')
        .setDescription('Get a card by ID')
        .addStringOption(option =>
            option.setName('uuid')
                .setDescription('The ID of the card')
                .setRequired(true)),

    async execute(client, interaction) {

        

        // try {
            const uuid = interaction.options.getString('uuid');

			if (!uuid) {
				return interaction.editReply({ content: 'Invalid card ID.', ephemeral: true });
			}

			const card = await client.db.query('card_data').where('uuid', uuid).first();

			if (!card) {
				return interaction.editReply({ content: 'Card not found.', ephemeral: true });
			}

			const stars = '⭐️'.repeat(card.stars);
			const folder = getCardImageFolderName(card.image_url);

			const embed = new EmbedBuilder()
				.setTitle(card.name)
				.setDescription(card.description || 'No description')
				.addFields(
					{ name: 'UUID', value: card.uuid || 'N/A', inline: false },
					{ name: 'Stars', value: stars || 'N/A', inline: false },
					{ name: 'Level', value: String(card.level) || 'N/A', inline: true },
					{ name: 'Power', value: String(card.power) || 'N/A', inline: true },
					{ name: 'Class', value: card.class || 'N/A', inline: true },
					{ name: 'Rarity', value: card.rarity || 'N/A', inline: true },
					{ name: 'Folder', value: folder || 'N/A', inline: true }
				)
				.setImage(card.image_url || null);

			await interaction.editReply({ embeds: [embed] });
        // } catch (error) {
        //     client.logger.error('Error:', error);
        //     await interaction.editReply({ content: 'An error occurred while processing the command.', ephemeral: true });
        // }
    }
};
