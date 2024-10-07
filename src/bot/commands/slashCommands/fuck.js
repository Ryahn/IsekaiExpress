const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../../../libs/utils');
const { MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('fuck')
        .setDescription('bang someone really hard')
        .addUserOption(option => option.setName('target').setDescription('the person you want to bang').setRequired(true)),

    async execute(client, interaction) {
        const user = interaction.options.getUser('target');


        if (interaction.channel.nsfw) {
            const response = await fetch('https://eckigerluca.com/api/fuck');
            const data = await response.json();

            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} bangs the shit out of ${user}`)
                .setColor(`#${getRandomColor()}`)
                .setImage(data.image);
            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply('This command can only be used in NSFW channels!');
        }
    },
};