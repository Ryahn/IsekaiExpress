const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');

module.exports = {
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
                return interaction.reply({ content: 'Caged role does not exist.', ephemeral: true });
            }

            const cagedUser = await client.db.getCage(userToUncage.id);

            if (!cagedUser) {
                return interaction.reply({ content: 'This user is not currently caged.', ephemeral: true });
            }

            const guildMember = await interaction.guild.members.fetch(userToUncage.id);

            if (!guildMember) {
                return interaction.reply({ content: 'User not found in the guild.', ephemeral: true });
            }

            await client.db.removeCage(userToUncage.id);
            await guildMember.roles.remove(cageRoleId);

            const embed = new MessageEmbed()
                .setTitle('Cage Removed')
                .setDescription(`${userToUncage.tag}'s cage has been removed and their roles have been restored.`)
                .setColor('#00FF00');

            await interaction.reply({ embeds: [embed] });
        // } catch (error) {
        //     client.logger.error(`Failed to remove cage from user ${userToUncage.id}:`, error);
        //     await interaction.reply({ content: 'An error occurred while trying to remove the cage.', ephemeral: true });
        // }
    }
};
