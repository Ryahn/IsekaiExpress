const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const { buildReactionReply } = require('../../../utils/imgApi');
const { fetchRandom } = require('../../../utils/nekosBest');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('wave')
        .setDescription("EllO!/GudBaYe")
        .addUserOption(option => option.setName('target').setDescription('The user you want to wave at')),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'wave');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
        try {
            const targetUser = interaction.options.getUser('target');

            const data = await client.rateLimitHandler.executeWithRateLimit('nekos-best', async () => {
                return await fetchRandom('wave');
            });
            const img = data.results[0].url;

            await interaction.editReply(buildReactionReply({
                actor: interaction.user,
                targetUser,
                actionText: (user, target) => `${user} waves at ${target}`,
                imageUrl: img,
                color: `#${getRandomColor()}`,
            }));
        } catch (err) {
            client.logger.error(err);
            await interaction.editReply('An error occurred while trying to wave at the user.');
        }
    },
};
