const { SlashCommandBuilder } = require('@discordjs/builders');
const { Permissions, MessageEmbed } = require('discord.js');
const moment = require('moment');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('cage')
        .setDescription('Apply the cage role to a user, stripping all other roles.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to cage')
                .setRequired(true)
            )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the cage')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('cage_type')
                .setDescription('Select the type of cage')
                .setChoices(
                    { name: 'Cage-OnTopic', value: '672595882562158592' },
                    { name: 'Cage-Porn', value: '443850934850945054' },
                    { name: 'Cage Memes', value: '790681121926938674' },
                    { name: 'Cage VC', value: '985741349267570718' },
                    { name: 'Server Cage', value: '330806236821848065' }
                ).setRequired(true)
            )
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration of the cage (e.g. 1h, 1d). Leave empty for permanent.')
                .setRequired(false)),

    async execute(client, interaction) {
        if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

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
            const userToCage = interaction.options.getUser('user');
            const duration = interaction.options.getString('duration');
            const guildMember = await interaction.guild.members.fetch(userToCage.id);
            const reason = interaction.options.getString('reason');
            const cageValue = interaction.options.getString('cage_type');

            if (!guildMember) {
                return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
            }

            const cageRole = interaction.guild.roles.cache.find(role => role.id === cageValue);
            if (!cageRole) {
                return interaction.reply({ content: `Cage role: ${cageValue} does not exist.`, ephemeral: true });
            }

            const cageName = guild.roles.cache.get(cageValue);

            if (!interaction.guild.members.me.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
                return interaction.reply({ content: 'I do not have permission to manage roles.', ephemeral: true });
            }

            const botRole = interaction.guild.members.me.roles.highest;
            if (guildMember.roles.highest.position >= botRole.position) {
                return interaction.reply({ content: 'I cannot cage this user because their role is higher than or equal to mine.', ephemeral: true });
            }

            const parseDuration = (input) => {
                const match = input.match(/^(\d+)([smhd])$/); // Supports seconds (s), minutes (m), hours (h), days (d)
                if (!match) return null;

                const value = parseInt(match[1], 10);
                const unit = match[2];

                switch (unit) {
                    case 's': return value; // seconds
                    case 'm': return value * 60; // minutes to seconds
                    case 'h': return value * 60 * 60; // hours to seconds
                    case 'd': return value * 60 * 60 * 24; // days to seconds
                    default: return null;
                }
            };

            let expires = 0;
            if (duration) {
                const durationInSeconds = parseDuration(duration);
                if (!durationInSeconds) {
                    return interaction.reply({ content: 'Invalid duration format. Use something like 1h, 30m, or 1d.', ephemeral: true });
                }
                expires = moment().unix() + durationInSeconds;
            }

            await client.db.createCage(userToCage.id, expires, interaction.user.tag, interaction.user.id, client.utils.timestamp(), reason, cageValue);

            await guildMember.roles.add(cageValue);
            await interaction.reply({ content: `<@${userToCage.id}> has been caged with role: ${cageName.name} successfully.` });

            let expiresText = expires === 0 ? 'Permanent' : `<t:${expires}:R>`;

            const modChannel = interaction.guild.channels.cache.find(ch => ch.name === 'moderator-chat');
            let modEmbed = new MessageEmbed()
                .setColor('RED')
                .setTitle('User Caged')
                .addFields([
                    { name: 'User', value: `<@${userToCage.id}>`, inline: true },
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Expires', value: expiresText, inline: false },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Cage Type', value: cageName.name, inline: false }
                ])
                .setTimestamp();

            if (modChannel) {
                await modChannel.send({ embeds: [modEmbed] });
            } else {
                client.logger.error('Moderator chat channel not found!');
            }
        // } catch (error) {
        //     client.logger.error('Error:', error);
        //     await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
        // }
    }
};
