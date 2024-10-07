const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const db = require('../../../../database/db');
const { timestamp } = require('../../../../libs/utils');
const logger = require('silly-logger');
module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription("Set your AFK status")
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message to send when someone pings you')
                .setRequired(true)),

    async execute(client, interaction) {
        const message = interaction.options.getString('message');

        try {
            await db.insertAfkUser(interaction.user.id, interaction.guild.id, message, timestamp());

            const embed = new MessageEmbed()
                .setColor('#00FF00')
                .setTitle('AFK Status Set')
                .setDescription(`You are now AFK: ${message}`);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error setting AFK status:', error);
            await interaction.reply('An error occurred while setting your AFK status.');
        } finally {
            await db.end();
        }
    },
};