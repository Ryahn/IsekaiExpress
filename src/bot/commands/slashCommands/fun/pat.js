const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { fetchImageForInteraction } = require('../../../utils/imgApi');
const config = require('../../../../../config');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('pat')
        .setDescription("pat pat")
        .addUserOption(option => option.setName('target').setDescription('The user you want to headpat')),

    async execute(client, interaction) {
        
        
        const { getRandomColor } = client.utils;
        try {

            let target = interaction.options.getUser('target') || interaction.user;
            const avatar = target.displayAvatarURL({ size: 512, format: 'jpg', dynamic: false });

            if (!config.imgApi.apiKey) {
                return interaction.editReply({
                    content: 'This command needs `IMG_API_KEY` in the environment.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const { url: img } = await fetchImageForInteraction(client, { category: 'sfw', type: 'pat' });

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

        let headPatTarget = target ? `${target}` : people[random];
        const embed = new EmbedBuilder()
            .setDescription(`${interaction.user} pats ${headPatTarget}`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        client.logger.error('Error executing the pat command:', error);
        if (!interaction.replied) {
            await interaction.editReply('Something went wrong.');
        }
    }
    },
};