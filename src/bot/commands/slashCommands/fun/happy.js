const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('happy')
        .setDescription("Feelin' happy?"),

    async execute(client, interaction) {
        
        
        const { getRandomColor } = client.utils;

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'happy');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }

        try {
            await interaction.deferReply();
            const response = await client.rateLimitHandler.executeWithRateLimit('nekos-best', async () => {
                return await fetchRandom('happy');
            });
            const data = await response.json();

            const img = data.results[0].url;

            const embed = new EmbedBuilder()
                .setDescription(`${interaction.user} is veri happi`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error fetching happy image:', error);
            await interaction.editReply('Failed to fetch a happy image.');
        }
    },
};