const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to unban')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('userid')
                .setDescription('The ID of the user to unban')
                .setRequired(false)),

    async execute(client, interaction) {
        try {
            await interaction.deferReply();

            if (!interaction.member.permissions.has("BAN_MEMBERS")) {
                return interaction.followUp('You do not have permission to warn users.');
            }

            const targetUser = interaction.options.getUser('user');
            const targetUserId = interaction.options.getString('userid');

            if (!targetUser && !targetUserId) {
                return interaction.followUp('You must provide either a user or a user ID.');
            }

            const userId = targetUser ? targetUser.id : targetUserId;

            if (userId === interaction.user.id) {
                return interaction.followUp('You cannot target yourself.');
            }
        
			await client.db.removeBan(userId);
			await interaction.guild.members.unban(userId);
			await interaction.followUp(`User <@${userId}> has been unbanned.`);

        } catch (err) {
            client.logger.error(err);
            await interaction.followUp(`An error occurred while trying to unban user <@${userId}>.`);
        }
    }
};
