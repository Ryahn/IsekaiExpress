const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../utils/functions');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('laugh')
        .setDescription("laugh"),

    async execute(client, interaction) {

        async function fetchImage() {
            const response = await fetchRandom('laugh');
            return response.results[0].url;
        }

        const img = await fetchImage();

        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} thinks it was funny`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};