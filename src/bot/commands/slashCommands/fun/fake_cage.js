const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('fake_cage')
        .setDescription("fake cage someone")
        .addUserOption(option => option.setName('target').setDescription('The user you want to cage').setRequired(true)),

    async execute(client, interaction) {

        

		const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'fake_cage');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        
        let targetUser = interaction.options.getUser('target');

			let messageContent = `<@${targetUser.id}>\nHello Caged user. You're detained under Paragraph 6 of Schedule 7 to the Terrorism Act 2000. You will not be detained for over 96 hours. You have the right and duty to remain silent.\n\nAs always your safety is our priority,\n-The Staff Team`;
		

        await interaction.editReply(messageContent);
    },
};
