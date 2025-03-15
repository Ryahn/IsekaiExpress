const { SlashCommandBuilder } = require('@discordjs/builders');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('enable_doublexp')
        .setDescription("Enable double XP"),

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

			if (!interaction.member.permissions.has("ADMINISTRATOR")) {
				return interaction.followUp('You do not have permission to enable double XP.');
			}

			const settings = await client.db.getXPSettings();
			let newState;

			if (settings.double_xp_enabled) {
				newState = false;
			} else {
				newState = true;
			}
			
			await client.db.toggleDoubleXP(newState);
			await interaction.followUp(`Double XP is now ${newState ? 'enabled' : 'disabled'}.`);
        } catch (error) {
            client.logger.error('Error executing the enable_doubleXP command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};