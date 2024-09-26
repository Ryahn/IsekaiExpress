const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../utils/functions');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('think')
        .setDescription("thonk"),

    async execute(client, interaction) {

        async function fetchImage() {
            const response = await fetchRandom('think');
            return response.results[0].url;
        }

        const img = await fetchImage();

        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} has big brain moment`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};