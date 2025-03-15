const { SlashCommandBuilder } = require('@discordjs/builders');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('fake_cage')
        .setDescription("fake cage someone")
        .addUserOption(option => option.setName('target').setDescription('The user you want to cage').setRequired(true)),

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

		const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'fake_cage');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        
        let targetUser = interaction.options.getUser('target');

			let messageContent = `<@${targetUser.id}>\nHello Caged user. You're detained under Paragraph 6 of Schedule 7 to the Terrorism Act 2000. You will not be detained for over 96 hours. You have the right and duty to remain silent.\n\nAs always your safety is our priority,\n-The Staff Team`;
		

        await interaction.reply(messageContent);
    },
};
