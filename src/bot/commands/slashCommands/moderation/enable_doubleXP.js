const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('enable_doublexp')
        .setDescription("Enable double XP"),

    async execute(client, interaction) {
        

        try {
            await interaction.deferReply();

			if (!interaction.member.permissions.has("ADMINISTRATOR")) {
				return interaction.followUp('You do not have permission to enable double XP.');
			}

			const guildId = interaction.guildId;
			const settings = await client.db.getXPSettings(guildId);
			let newState;

			if (settings.double_xp_enabled) {
				newState = false;
			} else {
				newState = true;
			}
			
			await client.db.toggleDoubleXP(newState, guildId);
			await interaction.followUp(`Double XP is now ${newState ? 'enabled' : 'disabled'}.`);
        } catch (error) {
            client.logger.error('Error executing the enable_doubleXP command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};