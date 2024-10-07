const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../../../libs/utils');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('pout')
        .setDescription("no u"),

    async execute(client, interaction) {

        async function fetchImage() {
            const response = await fetchRandom('pout');
            return response.results[0].url;
        }

        const img = await fetchImage();

    
        const embed = new MessageEmbed()
            .setDescription(`no u`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};