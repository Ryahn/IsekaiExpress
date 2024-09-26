const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment');
const StateManager = require('../../utils/StateManager');
const path = require('path'); // StateManager usage
const { generateUniqueId } = require('../../utils/functions');

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
        if (process.env.WARNING_SYSTEM_ENABLED !== 'true') {
            return interaction.reply('The warning system is not enabled.');
        }

        // Defer reply to allow time for processing
        await interaction.deferReply();

        // Check if the user has BAN_MEMBERS permission
        if (!interaction.member.permissions.has("BAN_MEMBERS")) {
            return interaction.followUp('You do not have permission to warn users.');
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (targetUser.id === interaction.user.id) {
            return interaction.followUp('You cannot warn yourself.');
        }
        const stateManager = new StateManager();
const filename = path.basename(__filename);


        try {
			try {
				await stateManager.initPool(); // Ensure the pool is initialized
			} catch (error) {
				console.error('Error initializing database connection pool:', error);
                 await stateManager.closePool(filename);
				await interaction.editReply('An error occurred while initializing the database connection.');
				return;
			}

            const warningId = generateUniqueId(); // Generate unique warning ID
            const staff = interaction.user;

            // Insert warning data into the database
            await stateManager.query(
                `INSERT INTO warnings (warn_id, warn_user_id, warn_user, warn_by_user, warn_by_id, warn_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [warningId, targetUser.id, targetUser.username, staff.username, staff.id, reason, moment().unix(), moment().unix()]
            );

            // Create an embed message for the warning
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

            const modEmbed = new MessageEmbed()
                .setColor('RED')
                .setTitle('New Warning Issued')
                .addFields([
                    { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Moderator', value: `<@${staff.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                ])
                .setTimestamp();

            // Send the warning to the interaction channel
            await interaction.followUp({ embeds: [embed] });

            // Send a message to the moderator channel
            const modChannel = interaction.guild.channels.cache.find(ch => ch.name === 'moderator-chat');
            if (modChannel) {
                await modChannel.send({ embeds: [modEmbed] });
            } else {
                console.error('Moderator chat channel not found!');
            }


        } catch (err) {
            console.error(err);
             await stateManager.closePool(filename);
            await interaction.followUp(`An error occurred while trying to warn user <@${targetUser.id}>.`);
        } finally {
             await stateManager.closePool(filename);
        }
    }
};
