const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('sleep')
        .setDescription("go 2 bed"),

    async execute(client, interaction) {

        
        
        const { getRandomColor } = client.utils;
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'sleep');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        try {
            await interaction.deferReply();

            const response = await client.rateLimitHandler.executeWithRateLimit('nekos-best', async () => {
                return await fetchRandom('sleep');
            });
            const data = await response.json();
            const img = data.results[0].url;

            const embed = new EmbedBuilder()
                .setDescription(`${interaction.user} thought it was smart to do ZzZz`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the sleep command:', error);
            await interaction.editReply('Something went wrong.');
        }
    },
};