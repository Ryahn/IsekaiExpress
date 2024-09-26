const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment'); // For easier timestamp handling
const StateManager = require('../../utils/StateManager');
const path = require('path'); // StateManager usage

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check_cages')
        .setDescription('Lists all currently caged users.'),
    async execute(client, interaction) {
        await interaction.deferReply(); // Defer the reply to give the bot time to process

        const stateManager = new StateManager();
        const filename = path.basename(__filename);

        try {
            await stateManager.initPool(); // Ensure the pool is initialized

            const currentTime = moment().unix(); // Get the current Unix timestamp
            const cagedUsers = await stateManager.query(
                `SELECT discord_id, expires FROM caged_users WHERE expires = 0 OR expires > ? ORDER BY expires ASC LIMIT 5`,
                [currentTime]
            );

            if (cagedUsers.length === 0) {
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
                    embed.addField(`${member.user.tag} (${member.id})`, `Cage Expires: ${expiresText}`);
                }
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in check_cages command:', error);
            await interaction.editReply('An error occurred while processing the command.');
        } finally {
            await stateManager.closePool(filename);
        }
    }
};
