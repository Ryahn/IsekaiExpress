const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription("Set your AFK status")
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message to send when someone pings you')
                .setRequired(true)),

    async execute(client, interaction) {
        

        const message = interaction.options.getString('message');
        const { timestamp } = client.utils;

        try {
            await interaction.deferReply();
            await client.db.createAfkUser(interaction.user.id, interaction.guild.id, message, timestamp());

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('AFK Status Set')
                .setDescription(`You are now AFK: ${message}`);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error setting AFK status:', error);
            await interaction.editReply('An error occurred while setting your AFK status.');
        }
    },
};