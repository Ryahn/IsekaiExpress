const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    
    data: new SlashCommandBuilder()
        .setName('poke')
        .setDescription("poke poke poke poke poke")
        .addUserOption(option => option.setName('target').setDescription('The user you want to poke')),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            let targetUser = interaction.options.getUser('target');

        async function fetchImage() {
            const response = await fetchRandom('poke');
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
       

        let pokeTarget = targetUser ? `${targetUser}` : people[random];
        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} pokes ${pokeTarget}`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        client.logger.error('Error executing the poke command:', error);
        if (!interaction.replied) {
            await interaction.reply('Something went wrong.');
        }
    }
    },
};