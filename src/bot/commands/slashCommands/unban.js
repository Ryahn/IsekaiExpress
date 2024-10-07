const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment');
const db = require('../../../../database/db');
const path = require('path');
const { generateUniqueId } = require('../../../../libs/utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to unban')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('userid')
                .setDescription('The ID of the user to unban')
                .setRequired(false)),

    async execute(client, interaction) {
        await interaction.deferReply();

        if (!interaction.member.permissions.has("BAN_MEMBERS")) {
            return interaction.followUp('You do not have permission to warn users.');
        }

		const targetUser = interaction.options.getUser('user');
        const targetUserId = interaction.options.getString('userid');

        if (!targetUser && !targetUserId) {
            return interaction.followUp('You must provide either a user or a user ID.');
        }

		const userId = targetUser ? targetUser.id : targetUserId;

		if (userId === interaction.user.id) {
            return interaction.followUp('You cannot target yourself.');
        }

        const stateManager = new StateManager();
        const filename = path.basename(__filename);

        try {
            await stateManager.initPool();

			await stateManager.query(`DELETE FROM bans WHERE discord_id = ?`, [userId]);
			await interaction.guild.members.unban(userId);
			await interaction.followUp(`User <@${userId}> has been unbanned.`);

        } catch (err) {
            console.error(err);
            await interaction.followUp(`An error occurred while trying to unban user <@${userId}>.`);
        } finally {
            await stateManager.closePool(filename);
        }
    }
};
