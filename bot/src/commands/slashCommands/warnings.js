const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const StateManager = require('../../utils/StateManager');
const path = require('path'); // StateManager usage
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
        if (process.env.WARNING_SYSTEM_ENABLED !== 'true') {
            return interaction.reply('The warning system is not enabled.');
        }

        // Defer reply to allow time for processing
        await interaction.deferReply();

        // Check if the user has BAN_MEMBERS permission
        if (!interaction.member.permissions.has("BAN_MEMBERS")) {
            return interaction.followUp('You do not have permission to list warnings for users.');
        }

        const targetUser = interaction.options.getUser('user');
        const pageRequested = interaction.options.getInteger('page') ? interaction.options.getInteger('page') - 1 : 0; // Default to page 0 (first page)
        const stateManager = new StateManager();
const filename = path.basename(__filename);
        try {
            await stateManager.initPool(); // Ensure the pool is initialized
        } catch (error) {
            console.error('Error initializing database connection pool:', error);
             await stateManager.closePool(filename);
            await interaction.editReply('An error occurred while initializing the database connection.');
            return;
        }

        try {

            // Query to get total warnings
            const totalWarningsResult = await stateManager.query(
                `SELECT COUNT(*) AS total_warnings FROM warnings WHERE warn_user_id = ?`,
                [targetUser.id]
            );
            const totalWarnings = totalWarningsResult[0].total_warnings;

            // Handle pagination variables
            const itemsPerPage = 5; // Number of warnings per page
            const totalPages = Math.ceil(totalWarnings / itemsPerPage);
            let currentPage = Math.min(Math.max(pageRequested, 0), totalPages - 1); // Clamp current page

            // Query to get warnings for the requested page
            const warnings = await stateManager.query(
                `SELECT warn_id, warn_by_user, warn_by_id, warn_reason, created_at 
                 FROM warnings 
                 WHERE warn_user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ${itemsPerPage} OFFSET ${currentPage * itemsPerPage}`,
                [targetUser.id]
            );

            let fields = [];
            warnings.forEach(warning => {
                fields.push({
                    name: `Warning ID: ${warning.warn_id}`,
                    value: `Moderator: <@${warning.warn_by_id}>\nReason: ${warning.warn_reason}\nDate: ${moment.unix(warning.created_at).format('MMMM Do YYYY, h:mm:ss a')}`,
                    inline: false
                });
            });

            const embed = new MessageEmbed()
                .setColor('RED')
                .setTitle('User Warnings')
                .setDescription(`<@${targetUser.id}> has a total of **${totalWarnings}** warnings.`)
                .addFields(fields)
                .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
                .setTimestamp();

            await interaction.followUp({ embeds: [embed] });


        } catch (err) {
            console.error(err);
             await stateManager.closePool(filename);
            await interaction.followUp(`An error occurred while trying to list warnings for user <@${targetUser.id}>.`);
        } finally {
             await stateManager.closePool(filename);
        }
    }
};
