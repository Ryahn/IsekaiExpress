const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    
    data: new SlashCommandBuilder()
        .setName('facepalm')
        .setDescription("a gif can say more than a thousand words"),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            async function fetchImage() {
                const response = await fetchRandom('facepalm');
                return response.results[0].url;
            }
            const img = await fetchImage();

            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} shows how dumb that shit was`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the facepalm command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};