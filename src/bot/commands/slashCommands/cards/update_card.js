const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const { getCardImageFolderName } = require('../../../../../libs/cardImageUrl');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('update_card')
        .setDescription('Update a card description')
        .addStringOption(option =>
            option.setName('uuid')
                .setDescription('The ID of the card')
                .setRequired(true))
            .addStringOption(option =>
                option.setName('description')
                .setDescription('The new description of the card')
                .setRequired(true)),

    async execute(client, interaction) {

        


        // try {
            const uuid = interaction.options.getString('uuid');
			const description = interaction.options.getString('description');
			if (!uuid || !description) {
				return interaction.editReply({ content: 'Invalid card ID or description.', ephemeral: true });
			}

			const checkCard = await client.db.query('card_data').where('uuid', uuid).first();
			if (!checkCard) {
				return interaction.editReply({ content: 'Card not found.', ephemeral: true });
			}

			const isOwner = String(checkCard.discord_id) === String(interaction.user.id);
			const roleIds = interaction.member?.roles?.cache;
			const isStaff =
				client.config.roles.staff
				&& roleIds
				&& roleIds.has(client.config.roles.staff);
			if (!isOwner && !isStaff) {
				return interaction.editReply({ content: `You are not allowed to update this card. Only the creator (or staff) can update it (<@${checkCard.discord_id}>).`, ephemeral: true });
			}

			const card = await client.db.updateCardDescription(uuid, description);

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
