const { SlashCommandBuilder } = require('@discordjs/builders');
const { getRandomColor } = require('../../utils/functions');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('fake_cage')
        .setDescription("fake cage someone")
        .addUserOption(option => option.setName('target').setDescription('The user you want to cage').required(true)),

    async execute(client, interaction) {
        let targetUser = interaction.options.getUser('target');

			let messageContent = `<@${targetUser.id}>
			Hello Caged user. You're detained under Paragraph 6 of Schedule 7 to the Terrorism Act 2000. You will not be detained for over 96 hours. You have the right and duty to remain silent.

As always your safety is our priority,
-The Staff Team`;
		

        await interaction.reply(messageContent);
    },
};
