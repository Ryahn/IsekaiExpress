const { SlashCommandBuilder } = require('@discordjs/builders');
const StateManager = require('../../utils/StateManager');
const path = require('path'); // StateManager usage

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delwarn')
        .setDescription('Deletes a warning by its ID.')
        .addStringOption(option => 
            option.setName('warn_id')
                .setDescription('The ID of the warning to delete')
                .setRequired(true)),

    async execute(client, interaction) {
        // Check if the warning system is enabled
        if (process.env.WARNING_SYSTEM_ENABLED !== 'true') {
            return interaction.reply('The warning system is not enabled.');
        }

        // Defer reply to allow time for processing
        await interaction.deferReply();

        // Check if the user has BAN_MEMBERS permission
        if (!interaction.member.permissions.has("BAN_MEMBERS")) {
            return interaction.followUp('You do not have permission to delete warnings.');
        }

        const warnId = interaction.options.getString('warn_id');

        // Validate the warning ID length
        if (warnId && warnId.length === 12) {
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

                // Delete the warning from the database
                await stateManager.query(
                    `DELETE FROM warnings WHERE warn_id = ?`,
                    [warnId]
                );

                // Confirm the warning has been deleted
                await interaction.followUp(`Warning with ID \`${warnId}\` has been deleted.`);


            } catch (err) {
                console.error(err);
                 await stateManager.closePool(filename);
                await interaction.followUp(`An error occurred while trying to delete warning \`${warnId}\`.`);
            } finally {
                 await stateManager.closePool(filename);
            }   
        } else {
            // If the warnId is invalid, send an error message
             await stateManager.closePool(filename);
            await interaction.followUp('Please provide a valid warning ID.');
        }
    }
};
