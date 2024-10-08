const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('cry')
        .setDescription("cry like a baby"),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            async function fetchImage() {
                const response = await fetchRandom('cry');
                return response.results[0].url;
            }

            const img = await fetchImage();

            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} cries`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the cry command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};