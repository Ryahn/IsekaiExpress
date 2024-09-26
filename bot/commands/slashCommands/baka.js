const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../utils/functions');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('baka')
        .setDescription("stupid"),

    async execute(client, interaction) {
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

        await interaction.reply({ embeds: [embed] });

    },
};