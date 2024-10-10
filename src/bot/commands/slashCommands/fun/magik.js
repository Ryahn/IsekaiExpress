const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');


module.exports = {
    
    data: new SlashCommandBuilder()
        .setName('magik')
        .setDescription('create magik')
        .addUserOption(option => option.setName('target').setDescription('user to magik').setRequired(false)),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            let target = interaction.options.getUser('target') || interaction.user;
            const avatar = target.displayAvatarURL({ size: 512, format: 'jpg', dynamic: false });
            const response = await fetch(`https://nekobot.xyz/api/imagegen?type=magik&image=${avatar}`);
            const data = await response.json();

            const embed = new MessageEmbed() // or MessageEmbed based on your version
                .setTitle('Magik')
                .setColor(`#${getRandomColor()}`)
                .setImage(data.message);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error executing the magik command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};
