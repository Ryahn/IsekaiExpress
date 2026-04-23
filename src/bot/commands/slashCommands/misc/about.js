const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription("about this bot"),

    async execute(client, interaction) {

        

        const { getRandomColor } = client.utils;

        try {

            const embed = new EmbedBuilder()
                .setTitle('About this bot')
                .setColor(`#${getRandomColor()}`)
                .addFields([{ name: 'Bot Name', value: 'IsekaiExpress', inline: true },
                    { name: 'Bot Version', value: '1.1.5', inline: true },
				{ name: 'Bot Author', value: '<@72884988374167552>', inline: true },
				{ name: 'Bot Support', value: 'Contact <@72884988374167552>', inline: true }
                ])
                .setFooter({ text: 'IsekaiExpress', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the about command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};