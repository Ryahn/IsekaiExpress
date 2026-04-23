const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('remove_cage')
        .setDescription('Removes the cage from a user and restores their roles.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove the cage from')
                .setRequired(true)),

    async execute(client, interaction) {

        

        const userToUncage = interaction.options.getUser('user');

        // try {

            const cageRoleId = await client.db.getCageRoleId(userToUncage.id);
            const cageRole = interaction.guild.roles.cache.find(role => role.id === cageRoleId);
            if (!cageRole) {
                return interaction.editReply({ content: 'Caged role does not exist.', ephemeral: true });
            }

            const cagedUser = await client.db.getCage(userToUncage.id);

            if (!cagedUser) {
                return interaction.editReply({ content: 'This user is not currently caged.', ephemeral: true });
            }

            const guildMember = await interaction.guild.members.fetch(userToUncage.id);

            if (!guildMember) {
                return interaction.editReply({ content: 'User not found in the guild.', ephemeral: true });
            }

            await client.db.removeCage(userToUncage.id);
            await guildMember.roles.remove(cageRoleId);

            const embed = new EmbedBuilder()
                .setTitle('Cage Removed')
                .setDescription(`${userToUncage.tag}'s cage has been removed and their roles have been restored.`)
                .setColor('#00FF00');

            await interaction.editReply({ embeds: [embed] });
        // } catch (error) {
        //     client.logger.error(`Failed to remove cage from user ${userToUncage.id}:`, error);
        //     await interaction.editReply({ content: 'An error occurred while trying to remove the cage.', ephemeral: true });
        // }
    }
};
