const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const { formatCardImagePathLabel } = require('../../../../../libs/cardImageUrl');
const { DISPLAY_LABEL } = require('../../../tcg/elements');
const { statLevelMultiplier } = require('../../../tcg/cardLayout');

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
			const artPath = formatCardImagePathLabel(card.image_url);
			const elementLabel = card.element ? (DISPLAY_LABEL[card.element] || card.element) : 'N/A';
			const isCatalogTemplate = card.base_power != null && card.base_atk != null;

			const fields = [
				{ name: 'UUID', value: card.uuid || 'N/A', inline: false },
				{ name: 'Stars', value: stars || 'N/A', inline: false },
				{ name: 'Class', value: card.class || 'N/A', inline: true },
				{ name: 'Rarity', value: card.rarity || 'N/A', inline: true },
				{ name: 'Element', value: elementLabel, inline: true },
				{ name: 'Art path', value: artPath, inline: false },
			];

			if (isCatalogTemplate) {
				fields.push(
					{
						name: 'Base stats',
						value: `ATK ${card.base_atk} · DEF ${card.base_def} · SPD ${card.base_spd} · HP ${card.base_hp}`,
						inline: false,
					},
					{ name: 'Base power (Lv1)', value: String(card.base_power), inline: true },
					{
						name: 'Power @ L5',
						value: String(
							Math.round(Number(card.base_power) * statLevelMultiplier(5)),
						),
						inline: true,
					},
					{
						name: 'Level',
						value: 'Per owned copy (inventory row)',
						inline: true,
					},
					{
						name: 'Ability',
						value: card.ability_key
							? String(card.ability_key).replace(/_/g, ' ')
							: 'Rolled when looted (inventory row)',
						inline: true,
					},
				);
			} else {
				fields.push(
					{ name: 'Level', value: String(card.level) || 'N/A', inline: true },
					{ name: 'Power', value: String(card.power) || 'N/A', inline: true },
					{
						name: 'Ability',
						value: card.ability_key ? String(card.ability_key).replace(/_/g, ' ') : 'N/A',
						inline: true,
					},
				);
			}

			const embed = new EmbedBuilder()
				.setTitle(card.name)
				.setDescription(card.description || 'No description')
				.addFields(fields)
				.setImage(card.image_url || null);

			await interaction.editReply({ embeds: [embed] });
        // } catch (error) {
        //     client.logger.error('Error:', error);
        //     await interaction.editReply({ content: 'An error occurred while processing the command.', ephemeral: true });
        // }
    }
};
