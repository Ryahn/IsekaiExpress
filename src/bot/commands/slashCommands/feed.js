const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../../../libs/utils');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('feed')
        .setDescription("pls give me food")
        .addUserOption(option => option.setName('target').setDescription('The user you want to feed')),

    async execute(client, interaction) {
        let targetUser = interaction.options.getUser('target');

        async function fetchImage() {
            const response = await fetchRandom('feed');
            return response.results[0].url;
        }

        const img = await fetchImage();

        let people = [
            'a random person',
            'OEJ',
            'M4zy',
            'Astolfokyun1',
            'Ryahn',
            'Sam',
            'a furry',
            'a 12 foot dildo',
            'a dakimakura',
            'a waifu',
            'a husbando'
        ];
        let random = Math.floor(Math.random() * people.length);

        let feedTarget = targetUser ? `${targetUser}` : people[random];
        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} feeds ${feedTarget}`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};