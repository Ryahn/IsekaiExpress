const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('baka')
        .setDescription("stupid"),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            async function fetchImage() {
                const response = await fetchRandom('baka');
                return response.results[0].url;
            }

            const img = await fetchImage();
            const embed = new MessageEmbed()
                .setTitle('stupid!')
                .setDescription(`${interaction.user} went tsundere`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the baka command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};