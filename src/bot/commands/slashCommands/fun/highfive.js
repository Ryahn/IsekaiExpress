const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const { buildReactionReply } = require('../../../utils/imgApi');
const { fetchRandom } = require('../../../utils/nekosBest');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('highfive')
        .setDescription("highfive someone")
        .addUserOption(option => option.setName('target').setDescription('The user you want to highfive')),

    async execute(client, interaction) {
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'highfive');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        const { getRandomColor } = client.utils;
        try {
            const targetUser = interaction.options.getUser('target');

            const data = await client.rateLimitHandler.executeWithRateLimit('nekos-best', async () => {
                return await fetchRandom('highfive');
            });

            const img = data.results[0].url;

            await interaction.editReply(buildReactionReply({
                actor: interaction.user,
                targetUser,
                actionText: (user, target) => `${user} highfives ${target}`,
                imageUrl: img,
                color: `#${getRandomColor()}`,
            }));
        } catch (error) {
            client.logger.error('Error executing the highfive command:', error);
            await interaction.editReply('Something went wrong.');
        }
    },
};
