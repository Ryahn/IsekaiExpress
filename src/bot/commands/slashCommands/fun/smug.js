const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const { buildReactionReply } = require('../../../utils/imgApi');
const { fetchRandom } = require('../../../utils/nekosBest');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('smug')
        .setDescription("I don't like where this is going")
        .addUserOption(option => option.setName('target').setDescription('The user you want to be smug with')),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'smug');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
        try {
            const targetUser = interaction.options.getUser('target');

            const data = await client.rateLimitHandler.executeWithRateLimit('nekos-best', async () => {
                return await fetchRandom('smug');
            });
            const img = data.results[0].url;

            await interaction.editReply(buildReactionReply({
                actor: interaction.user,
                targetUser,
                actionText: (user, target) => `${user} smugs at ${target}`,
                imageUrl: img,
                color: `#${getRandomColor()}`,
            }));
        } catch (error) {
            client.logger.error('Error executing the smug command:', error);
            await interaction.editReply('Something went wrong.');
        }
    },
};
