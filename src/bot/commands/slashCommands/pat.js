const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('pat')
        .setDescription("pat pat")
        .addUserOption(option => option.setName('target').setDescription('The user you want to headpat')),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            let target = interaction.options.getUser('target') || interaction.user;
            const avatar = target.displayAvatarURL({ size: 512, format: 'jpg', dynamic: false });
            const response = await fetch(`https://nekobot.xyz/api/imagegen?type=magik&image=${avatar}`);
            const data = await response.json();

        async function fetchImage() {
            const response = await fetchRandom('pat');
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

        let headPatTarget = targetUser ? `${targetUser}` : people[random];
        const embed = new MessageEmbed()
            .setDescription(`${interaction.user} pats ${headPatTarget}`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        client.logger.error('Error executing the pat command:', error);
        if (!interaction.replied) {
            await interaction.reply('Something went wrong.');
        }
    }
    },
};