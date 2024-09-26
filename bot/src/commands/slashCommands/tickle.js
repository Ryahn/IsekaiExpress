const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../utils/functions');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('tickle')
        .setDescription("tickle tickle tickle tickle")
        .addUserOption(option => option.setName('target').setDescription('The user you want to tickle')),

    async execute(client, interaction) {
        let targetUser = interaction.options.getUser('target');

        async function fetchImage() {
            const response = await fetchRandom('tickle');
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
            'a husbando'];
        let random = Math.floor(Math.random() * people.length);
       

        let tickleTarget = targetUser ? `${targetUser}` : people[random];

        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} tickles ${tickleTarget}`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};