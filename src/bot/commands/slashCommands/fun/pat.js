const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const { fetchImageForInteraction, buildReactionReply } = require('../../../utils/imgApi');
const config = require('../../../../../config');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('pat')
        .setDescription("pat pat")
        .addUserOption(option => option.setName('target').setDescription('The user you want to headpat')),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            const targetUser = interaction.options.getUser('target');

            if (!config.imgApi.apiKey) {
                return interaction.editReply({
                    content: 'This command needs `IMG_API_KEY` in the environment.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const { url: img } = await fetchImageForInteraction(client, { category: 'sfw', type: 'pat' });

            await interaction.editReply(buildReactionReply({
                actor: interaction.user,
                targetUser,
                actionText: (user, target) => `${user} pats ${target}`,
                imageUrl: img,
                color: `#${getRandomColor()}`,
            }));
        } catch (error) {
            client.logger.error('Error executing the pat command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};
