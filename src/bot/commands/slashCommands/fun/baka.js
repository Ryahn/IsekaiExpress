const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('baka')
        .setDescription("stupid"),

    async execute(client, interaction) {
        
        
        // Check if user is on cooldown
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'baka');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        
        const { getRandomColor } = client.utils;
        try {

            // Use rate limiting for the API call
            const img = await client.rateLimitHandler.executeWithRateLimit('nekos-best-api', async () => {
                const response = await fetchRandom('baka');
                return response.results[0].url;
            });

            const embed = new EmbedBuilder()
                .setTitle('stupid!')
                .setDescription(`${interaction.user} went tsundere`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
            
            // Set cooldown after successful execution
            client.cooldownManager.setCooldown(interaction.user.id, 'baka');
        } catch (error) {
            client.logger.error('Error executing the baka command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};