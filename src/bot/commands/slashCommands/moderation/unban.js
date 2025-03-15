const { SlashCommandBuilder } = require('@discordjs/builders');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

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
