const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');
const { extractRankFromImageUrl } = require('../../../utils/rankCardOcr');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('import_rank')
        .setDescription("Import your rank from an image URL. Be sure to run ?level first to get the rank from ZoneMaster.")
		.addStringOption(option => option.setName('url').setDescription('The url to import the rank from').setRequired(true)),

    async execute(client, interaction) {
        try {
			const imageUrl = interaction.options.getString('url');
			const { xpValue, usernameValue } = await extractRankFromImageUrl(imageUrl);
			const numericXp = Number(xpValue);

			if (numericXp && usernameValue) {
				if (interaction.member.user.username === usernameValue) {
					const level = client.utils.calculateLevel(numericXp);
					await client.db.updateUserXP(interaction.member.user.id, numericXp, 0, level);

					await interaction.followUp(`Imported XP: ${numericXp}\nImported Level: ${level}`);
				} else {
					await interaction.followUp('Username and XP values do not match. Please try again.');
				}
			} else {
				await interaction.followUp('Failed to extract XP or username. Please try again.');
			}
        } catch (error) {
            client.logger.error('Error executing import_rank:', error);
            if (!interaction.replied) {
                await interaction.followUp('Something went wrong.');
            }
        }
    },
};

