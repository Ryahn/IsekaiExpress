const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('check_cages')
        .setDescription('Lists all currently caged users.'),
    async execute(client, interaction) {
        await interaction.deferReply();

        try {
            const cagedUsers = await client.db.getCagedUsers(client.utils.timestamp());

            if (!cagedUsers) {
                return await interaction.editReply('No active caged users found.');
            }

            const embed = new MessageEmbed()
                .setTitle('Currently Caged Users')
                .setColor('#FF0000')
                .setFooter(`Displaying up to 5 caged users`);

            for (const user of cagedUsers) {
                const member = await interaction.guild.members.fetch(user.discord_id).catch(() => null);
                if (member) {
                    const expiresText = user.expires === 0 ? 'Permanent' : `<t:${user.expires}:R>`;
                    embed.addFields(
                        { name: `${member.user.tag} (${member.id})`, value: `Cage Expires: ${expiresText}` });
                }
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error in check_cages command:', error);
            await interaction.editReply('An error occurred while processing the command.');
        }
    }
};
