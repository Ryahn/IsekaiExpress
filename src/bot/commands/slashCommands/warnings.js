const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment');

module.exports = {
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
                client.db.query(
                    'SELECT COUNT(*) AS total_warnings FROM warnings WHERE warn_user_id = ?',
                    [targetUser.id]
                ),
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
    return db.query(
        `SELECT warn_id, warn_by_user, warn_by_id, warn_reason, created_at 
         FROM warnings 
         WHERE warn_user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [userId, itemsPerPage, offset]
    );
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
