const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { fetchRandom } = require('../../../utils/nekosBest');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('wink')
        .setDescription("are you able to read?"),

    async execute(client, interaction) {
        
        
        const { getRandomColor } = client.utils;
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'wink');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
        try {

            const data = await client.rateLimitHandler.executeWithRateLimit('nekos-best', async () => {
                return await fetchRandom('wink');
            });
            const img = data.results[0].url;

            const embed = new EmbedBuilder()
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({
                content: `${interaction.user} might want to tell us what is happening?`,
                embeds: [embed],
                allowedMentions: { users: [] },
            });
        } catch (error) {
            client.logger.error('Error in wink command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};