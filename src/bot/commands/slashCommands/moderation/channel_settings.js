const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const moment = require('moment');
const path = require('path');
const { hasGuildAdminOrStaffRole } = require('../../../utils/guildPrivileges');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('channel_settings')
        .setDescription('Get all channel settings.')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('The page number of channel settings')
                .setRequired(false)),

    async execute(client, interaction) {
        if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
            return interaction.editReply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const pageRequested = interaction.options.getInteger('page') || 1;

        try {
            const [totalCommandsResult, commands] = await Promise.all([
                client.db.query('command_settings').count('* as total_commands'),
                getCommandSettings(client.db, pageRequested)
            ]);

			const totalCommands = totalCommandsResult[0].total_commands;
            const itemsPerPage = 10;
            const totalPages = Math.ceil(totalCommands / itemsPerPage);
            const currentPage = Math.min(Math.max(pageRequested - 1, 0), totalPages - 1);

            const embed = createCommandSettingsEmbed(totalCommands, commands, currentPage, totalPages);
            await interaction.editReply({ embeds: [embed] });

           
        } catch (error) {
            client.logger.error('Error:', error);
            await interaction.editReply({ content: 'An error occurred while processing the command.', ephemeral: true });
        }
    }
};

async function getCommandSettings(db, page) {
    const itemsPerPage = 10;
    const offset = (page - 1) * itemsPerPage;
    return db.getCommandSettings(itemsPerPage, offset);
}

function createCommandSettingsEmbed(totalCommands, commands, currentPage, totalPages) {
	
    const fields = commands.map(command => ({
        name: `Command: ${command.name}`,
        value: `Channel: ${command.channel_id === 'all' ? 'All Channels' : `<#${command.channel_id}>`}`,
        inline: true
    }));

    return new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('Command Settings')
        .setDescription(`There are a total of **${totalCommands}** commands.`)
        .addFields(fields)
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
        .setTimestamp();
}