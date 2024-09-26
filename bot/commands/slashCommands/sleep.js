const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../utils/functions');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('sleep')
        .setDescription("go 2 bed"),

    async execute(client, interaction) {

        async function fetchImage() {
            const response = await fetchRandom('sleep');
            return response.results[0].url;
        }

        const img = await fetchImage();

        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} thought it was smart to do ZzZz`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};