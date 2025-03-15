const { SlashCommandBuilder } = require('@discordjs/builders');
const crypto = require('crypto');
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

        if (!client.config.warningSystem.enabled) {
            return interaction.reply('The warning system is not enabled.');
        }

        await interaction.deferReply();

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
