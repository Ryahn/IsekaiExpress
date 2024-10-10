const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    
    data: new SlashCommandBuilder()
        .setName('sleep')
        .setDescription("go 2 bed"),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();

            async function fetchImage() {
                const response = await fetchRandom('sleep');
                return response.results[0].url;
            }

            const img = await fetchImage();

            const embed = new MessageEmbed()
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