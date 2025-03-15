const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a user.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to warn')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('The reason for the warning')
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

        if (!client.config.warningSystem.enabled) {
            return interaction.reply('The warning system is not enabled.');
        }
        try {

            await interaction.deferReply();

            if (!interaction.member.permissions.has("BAN_MEMBERS")) {
                return interaction.followUp('You do not have permission to warn users.');
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (targetUser.id === interaction.user.id) {
                return interaction.followUp('You cannot warn yourself.');
            }

            const warningId = client.utils.generateUniqueId();
            const staff = interaction.user;

            await client.db.createWarning(warningId, targetUser.id, targetUser.username, staff.username, staff.id, reason, client.utils.timestamp());

            const embed = new MessageEmbed()
                .setColor('RED')
                .setTitle('User Warned')
                .addFields([
                    { name: 'Warning ID', value: warningId, inline: false },
                    { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Moderator', value: `<@${staff.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                ])
                .setTimestamp();

            await interaction.followUp({ embeds: [embed] });

            const modChannel = interaction.guild.channels.cache.find(ch => ch.name === 'moderator-chat');
            if (modChannel) {
                const modEmbed = new MessageEmbed()
                    .setColor('RED')
                    .setTitle('New Warning Issued')
                    .addFields([
                        { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                        { name: 'Moderator', value: `<@${staff.id}>`, inline: true },
                        { name: 'Reason', value: reason, inline: false }
                    ])
                    .setTimestamp();
                await modChannel.send({ embeds: [modEmbed] });
            } else {
                client.logger.error('Moderator chat channel not found!');
            }

        } catch (err) {
            client.logger.error(err);
            await interaction.followUp(`An error occurred while trying to warn user <@${targetUser.id}>.`);
        }
    }
};
