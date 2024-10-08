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

        try {
            await interaction.deferReply();
            const userToUncage = interaction.options.getUser('user');


            const [cagedUser] = await client.db.query(
                'SELECT old_roles FROM caged_users WHERE discord_id = ?',
                [userToUncage.id]
            );

            if (!cagedUser) {
                return interaction.editReply({ content: 'This user is not currently caged.', ephemeral: true });
            }

            const guildMember = await interaction.guild.members.fetch(userToUncage.id);

            if (!guildMember) {
                return interaction.editReply({ content: 'User not found in the guild.', ephemeral: true });
            }

            // Restore old roles
            const oldRoles = JSON.parse(cagedUser.old_roles);
            await guildMember.roles.set(oldRoles);

            // Remove the user from the caged_users table
            await client.db.query('DELETE FROM caged_users WHERE discord_id = ?', [userToUncage.id]);

            const embed = new MessageEmbed()
                .setTitle('Cage Removed')
                .setDescription(`${userToUncage.tag}'s cage has been removed and their roles have been restored.`)
                .setColor('#00FF00');

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error(`Failed to remove cage from user ${userToUncage.id}:`, error);
            await interaction.editReply({ content: 'An error occurred while trying to remove the cage.', ephemeral: true });
        }
    }
};
