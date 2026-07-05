const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { fetchImageForInteraction } = require('../../../utils/imgApi');
const config = require('../../../../../config');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('cry')
        .setDescription("cry like a baby"),

    async execute(client, interaction) {

        
        
        const { getRandomColor } = client.utils;

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'cry');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {
            // Use rate limiting for the API call
            if (!config.imgApi.apiKey) {
                return interaction.editReply({
                    content: 'This command needs `IMG_API_KEY` in the environment.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const { url: img } = await fetchImageForInteraction(client, { category: 'sfw', type: 'cry' });

            const embed = new EmbedBuilder()
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({
                content: `${interaction.user} cries`,
                embeds: [embed],
                allowedMentions: { users: [] },
            });
        } catch (error) {
            client.logger.error('Error executing the cry command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};