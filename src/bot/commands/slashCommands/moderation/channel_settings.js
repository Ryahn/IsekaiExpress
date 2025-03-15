const { SlashCommandBuilder } = require('@discordjs/builders');
const { Permissions, MessageEmbed } = require('discord.js');
const moment = require('moment');
const crypto = require('crypto');
const path = require('path');

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
        if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const hash = crypto.createHash('md5').update('channel_settings').digest('hex');
		const allowedChannel = await client.db.getAllowedChannel(hash);
		const guild = client.guilds.cache.get(interaction.guild.id);
		const member = await guild.members.fetch(interaction.user.id);
		const roles = member.roles.cache.map(role => role.id);

		if (allowedChannel && (allowedChannel.channel_id === 'all' || allowedChannel.channel_id !== interaction.channel.id)) {
			if (!roles.some(role => client.allowed.includes(role))) {
				return interaction.reply({ 
					content: `This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`, 
					ephemeral: true 
				});
			}
		}

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
            await interaction.reply({ embeds: [embed] });

           
        } catch (error) {
            client.logger.error('Error:', error);
            await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
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

    return new MessageEmbed()
        .setColor('RED')
        .setTitle('Command Settings')
        .setDescription(`There are a total of **${totalCommands}** commands.`)
        .addFields(fields)
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
        .setTimestamp();
}