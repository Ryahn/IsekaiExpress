const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('pout')
        .setDescription("no u"),

    async execute(client, interaction) {

        
        
        const { getRandomColor } = client.utils;
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'pout');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        try {
            await interaction.deferReply();

            const response = await client.rateLimitHandler.executeWithRateLimit('nekos-best', async () => {
                return await fetchRandom('pout');
            });
            const data = await response.json();
            const img = data.results[0].url;

    
            const embed = new EmbedBuilder()
                .setDescription(`no u`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the pout command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};