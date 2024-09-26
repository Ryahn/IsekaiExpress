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

        const currentTime = moment().unix(); // Get the current Unix timestamp

        // Initialize StateManager
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

        try {
            // Perform the query using StateManager
            const cagedUsers = await stateManager.query(
                `SELECT discord_id, expires FROM caged_users WHERE expires = 0 OR expires > ? ORDER BY expires ASC`,
                [currentTime]
            );

            if (cagedUsers.length === 0) {
                await interaction.editReply('No active caged users found.');
                return;
            }

            // Only list the first 5 users
            const limitedUsers = cagedUsers.slice(0, 5);

            const embed = new MessageEmbed()
                .setTitle('Currently Caged Users')
                .setColor('#FF0000')
                .setFooter({ text: `Displaying the first 5 out of ${cagedUsers.length}` });

            const fields = await Promise.all(limitedUsers.map(async user => {
                try {
                    const member = await interaction.guild.members.fetch(user.discord_id);
                    if (!member) {
                        return null; // Skip if the user is not found in the guild
                    }

                    let expiresText;
                    if (user.expires === 0) {
                        expiresText = 'Permanent';
                    } else {
                        expiresText = `<t:${user.expires}:R>`; // Display time as relative timestamp
                    }

                    return { name: `${member.user.tag} (${member.id})`, value: `Cage Expires: ${expiresText}` };
                } catch (error) {
                    console.error(`Failed to fetch user ${user.discord_id}:`, error);
                    return null;
                }
            }));

            // Filter out any null fields and then add them to the embed
            const validFields = fields.filter(field => field !== null);
            embed.addFields(validFields);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching caged users:', error);
            await interaction.editReply('An error occurred while fetching caged users.');
        } finally {
             await stateManager.closePool(filename);
        }
    }
};
