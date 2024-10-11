const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('check_cages')
        .setDescription('Lists all currently caged users.'),
    async execute(client, interaction) {

        // try {
            const cagedUsers = await client.db.getCagedUsers(client.utils.timestamp());

            if (!cagedUsers) {
                return await interaction.reply('No active caged users found.');
            }

            const embed = new MessageEmbed()
                .setTitle('Currently Caged Users')
                .setColor('#FF0000')
                .setFooter(`Displaying up to 5 caged users`);
            const guild = client.guilds.cache.get(client.config.discord.guildId);


            for (const user of cagedUsers) {
                const member = await interaction.guild.members.fetch(user.discord_id).catch(() => null);
                if (member) {
                    const expiresText = user.expires === 0 ? 'Permanent' : `<t:${user.expires}:R>`;
                    const cageRole = guild.roles.cache.get(user.role_id);

                    embed.addFields(
                        { name: 'User', value: `<@${user.discord_id}> (${user.discord_id})`, inline: false },
                        { name: 'Expires', value: `Cage Expires: ${expiresText}`, inline: false },
                        { name: 'Cage Type', value: `${cageRole ? cageRole.name : 'Unknown'}`, inline: true },
                        { name: 'Moderator', value: `<@${user.caged_by_id}>`, inline: true },
                        { name: 'Added At', value: `<t:${user.created_at}>`, inline: true },
                        { name: 'Reason', value: user.reason, inline: false },
                    );
                }
            }

            await interaction.reply({ embeds: [embed] });
        // } catch (error) {
        //     client.logger.error('Error in check_cages command:', error);
        //     await interaction.reply('An error occurred while processing the command.');
        // }
    }
};
