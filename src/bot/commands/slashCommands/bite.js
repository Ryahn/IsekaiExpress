const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('bite')
        .setDescription("bite someone :p")
        .addUserOption(option => option.setName('target').setDescription('The user you want to bite')),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            let targetUser = interaction.options.getUser('target');

            async function fetchImage() {
                const response = await fetchRandom('bite');
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

            // If target user is provided, mention them, otherwise use the random extra
            let biteTarget = targetUser ? `${targetUser}` : people[random];

            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} bites ${biteTarget}`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error in bite command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};
