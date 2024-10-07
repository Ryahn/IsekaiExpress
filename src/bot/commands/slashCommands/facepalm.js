const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../../../libs/utils');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('facepalm')
        .setDescription("a gif can say more than a thousand words"),

    async execute(client, interaction) {

        async function fetchImage() {
            const response = await fetchRandom('facepalm');
            return response.results[0].url;
        }
        const img = await fetchImage();

        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} shows how dumb that shit was`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};