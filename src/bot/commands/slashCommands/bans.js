const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const db = require('../../../../database/db');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bans')
        .setDescription('Lists the bans')
		.addIntegerOption(option => 
            option.setName('page')
                .setDescription('The page number of bans')
                .setRequired(false)),

    async execute(client, interaction) {
        if (!interaction.member.permissions.has("BAN_MEMBERS")) {
            return interaction.reply({ content: 'You do not have permission to list bans.', ephemeral: true });
        }

        await interaction.deferReply();

        const pageRequested = interaction.options.getInteger('page') ?? 1;

        try {

            const [totalBansResult, bans] = await Promise.all([
                db.query(
                    'SELECT COUNT(*) AS total_bans FROM bans WHERE discord_id = ?',
                    [targetUser.id]
                ),
                getBans(db, targetUser.id, pageRequested)
            ]);

            const totalBans = totalBansResult[0].total_bans;
            const itemsPerPage = 5;
            const totalPages = Math.ceil(totalBans / itemsPerPage);
            const currentPage = Math.min(Math.max(pageRequested - 1, 0), totalPages - 1);

            const embed = createBansEmbed(targetUser, totalBans, bans, currentPage, totalPages);
            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error('Error in warnings command:', err);
            await interaction.editReply('An error occurred while processing your request.');
        } finally {
            await stateManager.closePool(filename);
        }
    }
};

async function getBans(db, userId, page) {
    const itemsPerPage = 5;
    const offset = (page - 1) * itemsPerPage;
    return db.query(
        `SELECT ban_id, username, reason, method, banned_by_user, created_at 
         FROM bans 
         WHERE discord_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [userId, itemsPerPage, offset]
    );
}

function createBansEmbed(targetUser, totalBans, bans, currentPage, totalPages) {
    const fields = bans.map(ban => ({
        name: `Ban ID: ${ban.ban_id}`,
        value: `Moderator: <@${ban.banned_by_id}>\nReason: ${ban.reason}\nDate: ${moment.unix(ban.created_at).format('MMMM Do YYYY, h:mm:ss a')}`,
        inline: false
    }));

    return new MessageEmbed()
        .setColor('RED')
        .setTitle('User Bans')
        .setDescription(`<@${targetUser.id}> has a total of **${totalBans}** bans.`)
        .addFields(fields)
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
        .setTimestamp();
}
