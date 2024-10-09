const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    
    data: new SlashCommandBuilder()
        .setName('wink')
        .setDescription("are you able to read?"),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            
            async function fetchImage() {
                const response = await fetchRandom('wink');
                return response.results[0].url;
            }

            const img = await fetchImage();

            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} might want to tell us what is happening?`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error in wink command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};