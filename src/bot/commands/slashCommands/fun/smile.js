const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    
    data: new SlashCommandBuilder()
        .setName('smile')
        .setDescription("（*＾-＾*）")
        .addUserOption(option => option.setName('target').setDescription('The user you want to smile at')),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            let targetUser = interaction.options.getUser('target');

            async function fetchImage() {
                const response = await fetchRandom('smile');
                return response.results[0].url;
            }

            const img = await fetchImage();

            let people = [
                'at random person',
                'at OEJ',
                'at M4zy',
                'at Astolfokyun1',
                'at Ryahn',
                'at Sam',
                'at furry',
                'at 12 foot dildo',
                'at dakimakura',
                'at waifu',
                'at husbando'];
            let random = Math.floor(Math.random() * people.length);
        

            let smileTarget = targetUser ? `${targetUser}` : people[random];

            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} smiles ${smileTarget}`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the smile command:', error);
            await interaction.editReply('Something went wrong.');
        }
    },
};