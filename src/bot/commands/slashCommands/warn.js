const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment');
const { generateUniqueId } = require('../../../../libs/utils');

module.exports = {
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

            const warningId = generateUniqueId();
            const staff = interaction.user;

            await client.db.query(
                `INSERT INTO warnings (warn_id, warn_user_id, warn_user, warn_by_user, warn_by_id, warn_reason, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [warningId, targetUser.id, targetUser.username, staff.username, staff.id, reason, moment().unix(), moment().unix()]
            );

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
