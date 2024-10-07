const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../../../libs/utils');
const { MessageEmbed } = require('discord.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription("about this bot"),

    async execute(client, interaction) {

        const embed = new MessageEmbed()
            .setTitle('About this bot')
            .setColor(`#${getRandomColor()}`)
            .addFields([{ name: 'Bot Name', value: 'IsekaiExpress', inline: true },
				{ name: 'Bot Version', value: '1.1.5', inline: true },
				{ name: 'Bot Author', value: '<@72884988374167552>', inline: true },
				{ name: 'Bot Support', value: 'Contact <@72884988374167552>', inline: true }
			])
			.setFooter({ text: 'IsekaiExpress', iconURL: client.user.displayAvatarURL() })
			.setTimestamp();

        await interaction.reply({ embeds: [embed] });

    },
};