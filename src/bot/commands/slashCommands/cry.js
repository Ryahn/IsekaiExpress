const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../../../libs/utils');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('cry')
        .setDescription("cry like a baby"),

    async execute(client, interaction) {
        async function fetchImage() {
            const response = await fetchRandom('cry');
            return response.results[0].url;
        }

        const img = await fetchImage();

        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} cries`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};