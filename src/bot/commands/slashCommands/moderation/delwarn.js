const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('delwarn')
        .setDescription('Deletes a warning by its ID.')
        .addStringOption(option => 
            option.setName('warn_id')
                .setDescription('The ID of the warning to delete')
                .setRequired(true)),

    async execute(client, interaction) {

        

        if (!client.config.warningSystem.enabled) {
            return interaction.editReply('The warning system is not enabled.');
        }

        if (!interaction.member.permissions.has("BAN_MEMBERS")) {
            return interaction.followUp('You do not have permission to delete warnings.');
        }

        const warnId = interaction.options.getString('warn_id');

        if (warnId && warnId.length === 12) {
			
            try {
                await client.db.deleteWarning(warnId);

                await interaction.followUp(`Warning with ID \`${warnId}\` has been deleted.`);


            } catch (err) {
                client.logger.error(err);
                await interaction.followUp(`An error occurred while trying to delete warning \`${warnId}\`.`);
            }  
        } else {
            await interaction.followUp('Please provide a valid warning ID.');
        }
    }
};
