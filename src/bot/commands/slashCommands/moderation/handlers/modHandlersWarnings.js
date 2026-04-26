const { EmbedBuilder } = require('discord.js');
const moment = require('moment');

async function warnExecute(client, interaction) {
  if (!client.config.warningSystem.enabled) {
    return interaction.editReply('The warning system is not enabled.');
  }
  try {
    if (!interaction.member.permissions.has('BAN_MEMBERS')) {
      return interaction.followUp('You do not have permission to warn users.');
    }

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (targetUser.id === interaction.user.id) {
      return interaction.followUp('You cannot warn yourself.');
    }

    const warningId = client.utils.generateUniqueId();
    const staff = interaction.user;

    await client.db.createWarning(
      warningId,
      targetUser.id,
      targetUser.username,
      staff.username,
      staff.id,
      reason,
      client.utils.timestamp(),
    );

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('User Warned')
      .addFields([
        { name: 'Warning ID', value: warningId, inline: false },
        { name: 'User', value: `<@${targetUser.id}>`, inline: true },
        { name: 'Moderator', value: `<@${staff.id}>`, inline: true },
        { name: 'Reason', value: reason, inline: false },
      ])
      .setTimestamp();

    await interaction.followUp({ embeds: [embed] });

    const modChannel = interaction.guild.channels.cache.find((ch) => ch.name === 'moderator-chat');
    if (modChannel) {
      const modEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('New Warning Issued')
        .addFields([
          { name: 'User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Moderator', value: `<@${staff.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        ])
        .setTimestamp();
      await modChannel.send({ embeds: [modEmbed] });
    } else {
      client.logger.error('Moderator chat channel not found!');
    }
  } catch (err) {
    client.logger.error(err);
    await interaction.followUp('An error occurred while trying to warn the user.');
  }
}

async function getWarnings(db, userId, page) {
  const itemsPerPage = 5;
  const offset = (page - 1) * itemsPerPage;
  return db.getWarningsOffset(userId, itemsPerPage, offset);
}

function createWarningsEmbed(targetUser, totalWarnings, warnings, currentPage, totalPages) {
  const fields = warnings.map((warning) => ({
    name: `Warning ID: ${warning.warn_id}`,
    value: `Moderator: <@${warning.warn_by_id}>\nReason: ${warning.warn_reason}\nDate: ${moment.unix(warning.created_at).format('MMMM Do YYYY, h:mm:ss a')}`,
    inline: false,
  }));

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('User Warnings')
    .setDescription(`<@${targetUser.id}> has a total of **${totalWarnings}** warnings.`)
    .addFields(fields)
    .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
    .setTimestamp();
}

async function warningsListExecute(client, interaction) {
  if (!client.config.warningSystem.enabled) {
    return interaction.editReply({ content: 'The warning system is not enabled.', ephemeral: true });
  }

  if (!interaction.member.permissions.has('BAN_MEMBERS')) {
    return interaction.editReply({ content: 'You do not have permission to list warnings for users.', ephemeral: true });
  }

  const targetUser = interaction.options.getUser('user');
  const pageRequested = interaction.options.getInteger('page') ?? 1;

  try {
    const [totalWarningsResult, warnings] = await Promise.all([
      client.db.query('warnings').count('* as total_warnings').where({ warn_user_id: targetUser.id }),
      getWarnings(client.db, targetUser.id, pageRequested),
    ]);

    const totalWarnings = totalWarningsResult[0].total_warnings;
    const itemsPerPage = 5;
    const totalPages = Math.ceil(totalWarnings / itemsPerPage);
    const currentPage = Math.min(Math.max(pageRequested - 1, 0), Math.max(totalPages - 1, 0));

    const embed = createWarningsEmbed(targetUser, totalWarnings, warnings, currentPage, totalPages);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    client.logger.error('Error in warnings command:', err);
    await interaction.editReply('An error occurred while processing your request.');
  }
}

async function delwarnExecute(client, interaction) {
  if (!client.config.warningSystem.enabled) {
    return interaction.editReply('The warning system is not enabled.');
  }

  if (!interaction.member.permissions.has('BAN_MEMBERS')) {
    return interaction.followUp('You do not have permission to delete warnings.');
  }

  const warnId = interaction.options.getString('warn_id');

  if (warnId && warnId.length === 12) {
    try {
      await client.db.deleteWarning(warnId);
      await interaction.followUp(`Warning with ID \`${warnId}\` has been deleted.`);
    } catch (err) {
      client.logger.error(err);
      await interaction.followUp(`An error occurred while trying to delete warning \`${warnId}\`.`);
    }
  } else {
    await interaction.followUp('Please provide a valid warning ID.');
  }
}

module.exports = { warnExecute, warningsListExecute, delwarnExecute };
