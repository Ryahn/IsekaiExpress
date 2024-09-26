const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment'); // For easier timestamp handling
const { getConnection } = require('../../../database/db'); // Replace with your actual database setup
const StateManager = require('../../utils/StateManager');
const path = require('path'); // StateManager usage

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove_cage')
        .setDescription('Removes the cage from a user and restores their roles.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove the cage from')
                .setRequired(true)),

    async execute(client, interaction) {
        await interaction.deferReply(); // Defer the reply to give the bot time to process

        const userToUncage = interaction.options.getUser('user');

		const stateManager = new StateManager();
const filename = path.basename(__filename);
        try {
            await stateManager.initPool(); // Ensure the pool is initialized
        } catch (error) {
            console.error('Error initializing database connection pool:', error);
             await stateManager.closePool(filename);
            await interaction.editReply('An error occurred while initializing the database connection.');
            return;
        }

        // Fetch the user entry from the database
        const [cagedUser] = await stateManager.query(
            `SELECT discord_id, old_roles FROM caged_users WHERE discord_id = ?`,
            [userToUncage.id]
        );

        if (!cagedUser) {
            await interaction.editReply({ content: 'This user is not currently caged.', ephemeral: true });
             await stateManager.closePool(filename);
            return;
        }

        try {
            const guildMember = await interaction.guild.members.fetch(userToUncage.id);

            if (!guildMember) {
                await interaction.editReply({ content: 'User not found in the guild.', ephemeral: true });
                return;
            }

            // Restore old roles
            const oldRoles = JSON.parse(cagedUser.old_roles);
            await guildMember.roles.set(oldRoles).catch(console.error);

            // Remove the user from the caged_users table
            await stateManager.query(`DELETE FROM caged_users WHERE discord_id = ?`, [userToUncage.id]);

            const embed = new MessageEmbed()
                .setTitle('Cage Removed')
                .setDescription(`${userToUncage.tag}'s cage has been removed and their roles have been restored.`)
                .setColor('#00FF00');

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`Failed to remove cage from user ${userToUncage.id}:`, error);
             await stateManager.closePool(filename);
            await interaction.editReply({ content: 'An error occurred while trying to remove the cage.', ephemeral: true });
        } finally {
             await stateManager.closePool(filename);
        }

    }
};
