const { SlashCommandBuilder } = require('@discordjs/builders');
const { Permissions, MessageEmbed } = require('discord.js');
const moment = require('moment');
const db = require('../../../../database/db');
const logger = require('silly-logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cage')
        .setDescription('Apply the cage role to a user, stripping all other roles.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to cage')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration of the cage (e.g. 1h, 1d). Leave empty for permanent.')
                .setRequired(false)),

    async execute(client, interaction) {
        if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        try {
            const userToCage = interaction.options.getUser('user');
            const duration = interaction.options.getString('duration');
            const guildMember = await interaction.guild.members.fetch(userToCage.id);

            if (!guildMember) {
                return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
            }

            // Cage role: Ensure you have a role named "Caged" in your server
            const cageRole = interaction.guild.roles.cache.find(role => role.name === 'Caged');
            if (!cageRole) {
                return interaction.reply({ content: 'Caged role does not exist.', ephemeral: true });
            }

            // Check if the bot has permission to manage roles
            if (!interaction.guild.members.me.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
                return interaction.reply({ content: 'I do not have permission to manage roles.', ephemeral: true });
            }

            // Check if the bot's role is higher than the user's highest role
            const botRole = interaction.guild.members.me.roles.highest;
            if (guildMember.roles.highest.position >= botRole.position) {
                return interaction.reply({ content: 'I cannot cage this user because their role is higher than or equal to mine.', ephemeral: true });
            }

            // Collect all the current roles, except for @everyone (ID: guild id)
            const rolesToStrip = guildMember.roles.cache.filter(role => role.id !== interaction.guild.id).map(role => role.id);

            if (rolesToStrip.length === 0) {
                return interaction.reply({ content: 'User has no roles to strip.', ephemeral: true });
            }

            // Function to parse duration like '1h', '30m', '2d' into seconds
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
                expires = moment().unix() + durationInSeconds; // Convert to Unix timestamp
            }

            // Store the roles in the database before removing them
            const rolesJson = JSON.stringify(rolesToStrip);
            await db.query(
                `INSERT INTO caged_users (discord_id, old_roles, expires, caged_by_user, caged_by_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [userToCage.id, rolesJson, expires, interaction.user.tag, interaction.user.id, moment().unix()]
            );

            // Attempt to add the cage role
            await guildMember.roles.add(cageRole.id);
            await interaction.reply({ content: `${userToCage.tag} has been caged successfully.` });

            // Set up the expiration text and mod message
            let expiresText = expires === 0 ? 'Permanent' : `<t:${expires}:R>`;

            const modChannel = interaction.guild.channels.cache.find(ch => ch.name === 'moderator-chat');
            let modEmbed = new MessageEmbed()
                .setColor('RED')
                .setTitle('User Caged')
                .addFields([
                    { name: 'User', value: `<@${userToCage.id}>`, inline: true },
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Expires', value: expiresText, inline: false }
                ])
                .setTimestamp();

            if (modChannel) {
                await modChannel.send({ embeds: [modEmbed] });
            } else {
                logger.error('Moderator chat channel not found!');
            }
        } catch (error) {
            logger.error('Error:', error);
            await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
        } finally {
            await db.end();
        }
    }
};
