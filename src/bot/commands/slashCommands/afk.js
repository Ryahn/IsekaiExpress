const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const StateManager = require('../../utils/StateManager');
const { timestamp } = require('../../utils/functions');
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
        const stateManager = new StateManager();
        const filename = 'afk.js';

        try {
            await stateManager.initPool();

            // Store AFK status in the database
            await stateManager.query(
                'INSERT INTO afk_users (user_id, guild_id, message, timestamp) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE message = ?, timestamp = ?',
                [interaction.user.id, interaction.guild.id, message, timestamp(), message, timestamp()]
            );

            const embed = new MessageEmbed()
                .setColor('#00FF00')
                .setTitle('AFK Status Set')
                .setDescription(`You are now AFK: ${message}`);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error setting AFK status:', error);
            await interaction.reply('An error occurred while setting your AFK status.');
        } finally {
            await stateManager.closePool(filename);
        }
    },
};