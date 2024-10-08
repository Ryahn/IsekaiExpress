const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('blush')
        .setDescription("blush"),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            async function fetchImage() {
                const response = await fetchRandom('blush');
                return response.results[0].url;
            }

            const img = await fetchImage();

            if (!extra) {
                extra = '';
            }
            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} uhm you're a bit red in your face`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the blush command:', error);
            if (!interaction.replied) {
                await interaction.reply('Something went wrong.');
            }
        }
    },
};