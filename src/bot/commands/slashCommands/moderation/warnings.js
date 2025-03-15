const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Lists the warnings for a user.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to list warnings for')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('page')
                .setDescription('The page number of warnings')
                .setRequired(false)),

    async execute(client, interaction) {

        const hash = crypto.createHash('md5').update(module.exports.data.name).digest('hex');
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

        // Check if the warning system is enabled
        if (!client.config.warningSystem.enabled) {
            return interaction.reply({ content: 'The warning system is not enabled.', ephemeral: true });
        }

        if (!interaction.member.permissions.has("BAN_MEMBERS")) {
            return interaction.reply({ content: 'You do not have permission to list warnings for users.', ephemeral: true });
        }

        // Defer reply to allow time for processing
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user');
        const pageRequested = interaction.options.getInteger('page') ?? 1;

        try {

            const [totalWarningsResult, warnings] = await Promise.all([
                client.db.query('warnings').count('* as total_warnings').where({warn_user_id: targetUser.id}),
                getWarnings(client.db, targetUser.id, pageRequested)
            ]);

            const totalWarnings = totalWarningsResult[0].total_warnings;
            const itemsPerPage = 5;
            const totalPages = Math.ceil(totalWarnings / itemsPerPage);
            const currentPage = Math.min(Math.max(pageRequested - 1, 0), totalPages - 1);

            const embed = createWarningsEmbed(targetUser, totalWarnings, warnings, currentPage, totalPages);
            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            client.logger.error('Error in warnings command:', err);
            await interaction.editReply('An error occurred while processing your request.');
        }
    }
};

async function getWarnings(db, userId, page) {
    const itemsPerPage = 5;
    const offset = (page - 1) * itemsPerPage;
    return db.getWarningsOffset(userId, itemsPerPage, offset);
}

function createWarningsEmbed(targetUser, totalWarnings, warnings, currentPage, totalPages) {
    const fields = warnings.map(warning => ({
        name: `Warning ID: ${warning.warn_id}`,
        value: `Moderator: <@${warning.warn_by_id}>\nReason: ${warning.warn_reason}\nDate: ${moment.unix(warning.created_at).format('MMMM Do YYYY, h:mm:ss a')}`,
        inline: false
    }));

    return new MessageEmbed()
        .setColor('RED')
        .setTitle('User Warnings')
        .setDescription(`<@${targetUser.id}> has a total of **${totalWarnings}** warnings.`)
        .addFields(fields)
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
        .setTimestamp();
}
