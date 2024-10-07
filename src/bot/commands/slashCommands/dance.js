const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../utils/functions');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('dance')
        .setDescription("Keep On Ravin' Baby")
        .addUserOption(option => option.setName('target').setDescription('The user you want to dance with')),

    async execute(client, interaction) {
        let targetUser = interaction.options.getUser('target');

        async function fetchImage() {
            const response = await fetchRandom('dance');
            return response.results[0].url;
        }

        const img = await fetchImage();

        let people = ['with everyone',
            'with a random person',
            'with OEJ',
            'with M4zy',
            'with Astolfokyun1',
            'with Ryahn',
            'with Sam',
            'with a furry',
            'with a 12 foot dildo',
            'with a dakimakura',
            'with a waifu',
            'with a husbando'];
        let random = Math.floor(Math.random() * people.length);
       

        let danceTarget = targetUser ? `${targetUser}` : people[random];
        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} dances ${danceTarget}`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });

    },
};