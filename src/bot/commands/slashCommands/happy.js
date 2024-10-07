const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../../../libs/utils');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('happy')
        .setDescription("Feelin' happy?"),

    async execute(client, interaction) {

        async function fetchImage() {
            const response = await fetchRandom('happy');
            return response.results[0].url;
        }

        const img = await fetchImage();

        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} is veri happi`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};