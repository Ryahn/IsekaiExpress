const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('check_cages')
        .setDescription('Lists all currently caged users.'),
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

        // try {
            const cagedUsers = await client.db.getCagedUsers(client.utils.timestamp());

            if (!cagedUsers) {
                return await interaction.reply('No active caged users found.');
            }

            const embed = new MessageEmbed()
                .setTitle('Currently Caged Users')
                .setColor('#FF0000')
                .setFooter(`Displaying up to 5 caged users`);


            for (const user of cagedUsers) {
                const member = await interaction.guild.members.fetch(user.discord_id).catch(() => null);
                if (member) {
                    const expiresText = user.expires === 0 ? 'Permanent' : `<t:${user.expires}:R>`;
                    const cageRole = guild.roles.cache.get(user.role_id);

                    embed.addFields(
                        { name: 'User', value: `<@${user.discord_id}> (${user.discord_id})`, inline: false },
                        { name: 'Expires', value: `Cage Expires: ${expiresText}`, inline: false },
                        { name: 'Cage Type', value: `${cageRole ? cageRole.name : 'Unknown'}`, inline: true },
                        { name: 'Moderator', value: `<@${user.caged_by_id}>`, inline: true },
                        { name: 'Added At', value: `<t:${user.created_at}>`, inline: true },
                        { name: 'Reason', value: user.reason, inline: false },
                    );
                }
            }

            await interaction.reply({ embeds: [embed] });
        // } catch (error) {
        //     client.logger.error('Error in check_cages command:', error);
        //     await interaction.reply('An error occurred while processing the command.');
        // }
    }
};
