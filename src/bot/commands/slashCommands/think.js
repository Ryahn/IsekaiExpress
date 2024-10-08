const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('think')
        .setDescription("thonk"),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();

            async function fetchImage() {
                const response = await fetchRandom('think');
                return response.results[0].url;
            }

            const img = await fetchImage();

            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} has big brain moment`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the think command:', error);
            await interaction.editReply('Something went wrong.');
        }
    },
};