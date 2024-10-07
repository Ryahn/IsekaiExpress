const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../../../libs/utils');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('cuddle')
        .setDescription("that's lewd")
        .addUserOption(option => option.setName('target').setDescription('The user you want to cuddle with')),

    async execute(client, interaction) {
        let targetUser = interaction.options.getUser('target');

        async function fetchImage() {
            const response = await fetchRandom('cuddle');
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

        let cuddleTarget = targetUser ? `${targetUser}` : people[random];
        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} cuddles ${cuddleTarget}`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};