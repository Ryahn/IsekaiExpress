const { EmbedBuilder } = require('discord.js');
const moment = require('moment');

async function getBans(db, page) {
  const itemsPerPage = 5;
  const offset = (page - 1) * itemsPerPage;
  return db('bans')
    .select('ban_id', 'discord_id', 'username', 'reason', 'banned_by_id', 'banned_by_user', 'created_at')
    .orderBy('created_at', 'desc')
    .limit(itemsPerPage)
    .offset(offset);
}

function createBansEmbed(totalBans, bans, currentPage, totalPages) {
  const fields = bans.map((ban) => ({
    name: `Ban ID: ${ban.ban_id}`,
    value: `Moderator: <@${ban.banned_by_id}>\nReason: ${ban.reason}\nDate: ${moment.unix(ban.created_at).format('MMMM Do YYYY, h:mm:ss a')}`,
    inline: false,
  }));

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('User Bans')
    .setDescription(`**${totalBans}** bans.`)
    .addFields(fields)
    .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
    .setTimestamp();
}

async function bansListExecute(client, interaction) {
  if (!interaction.member.permissions.has('BAN_MEMBERS')) {
    return interaction.editReply({ content: 'You do not have permission to list bans.', ephemeral: true });
  }

  const pageRequested = interaction.options.getInteger('page') ?? 1;

  try {
    const [totalBansResult, bans] = await Promise.all([
      client.db.query.table('bans').count('* as total_bans'),
      getBans(client.db.query, pageRequested),
    ]);

    const totalBans = totalBansResult[0].total_bans;
    const itemsPerPage = 5;
    const totalPages = Math.ceil(totalBans / itemsPerPage) || 1;
    const currentPage = Math.min(Math.max(pageRequested - 1, 0), totalPages - 1);

    const embed = createBansEmbed(totalBans, bans, currentPage, totalPages);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    client.logger.error('Error in bans command:', err);
    await interaction.editReply('An error occurred while processing your request.');
  }
}

async function unbanExecute(client, interaction) {
  let userId;
  try {
    if (!interaction.member.permissions.has('BAN_MEMBERS')) {
      return interaction.followUp('You do not have permission to unban users.');
    }

    const targetUser = interaction.options.getUser('user');
    const targetUserId = interaction.options.getString('userid');

    if (!targetUser && !targetUserId) {
      return interaction.followUp('You must provide either a user or a user ID.');
    }

    userId = targetUser ? targetUser.id : targetUserId;

    if (userId === interaction.user.id) {
      return interaction.followUp('You cannot target yourself.');
    }

    await client.db.removeBan(userId);
    await interaction.guild.members.unban(userId);
    await interaction.followUp(`User <@${userId}> has been unbanned.`);
  } catch (err) {
    client.logger.error(err);
    await interaction.followUp(`An error occurred while trying to unban user <@${userId}>.`);
  }
}

module.exports = { bansListExecute, unbanExecute };
