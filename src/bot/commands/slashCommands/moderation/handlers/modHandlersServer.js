const { EmbedBuilder } = require('discord.js');
const moment = require('moment');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../../../../utils/guildPrivileges');
const {
  fetchAndChunkChoices,
  augmentUpdateCommandSubcommand,
  updateCommandSettingsExecute,
} = require('./updateCommandSettingsBuilder');

function forumTagToData(tag) {
  return {
    name: tag.name,
    moderated: tag.moderated,
    emoji: tag.emoji ? { id: tag.emoji.id, name: tag.emoji.name } : null,
  };
}

async function serverSettingsExecute(client, interaction) {
  try {
    const option = interaction.options.getString('option');

    if (!option) {
      await interaction.editReply('Please choose an option to change.');
      return;
    }

    const guildId = interaction.guild.id;
    const guildConfig = await client.db.getGuildConfigurable(guildId);

    switch (option) {
      case 'xp_system': {
        const newXpEnabled = !guildConfig.xp_enabled;
        await client.db.query('GuildConfigurable').where({ guildId }).update({ xp_enabled: newXpEnabled });
        await interaction.editReply(`XP system has been ${newXpEnabled ? 'enabled' : 'disabled'}.`);
        break;
      }
      case 'warning_system': {
        const warningChannel = interaction.options.getChannel('warning_channel');
        if (!warningChannel) {
          await interaction.editReply('Please choose a channel to send the warning message.');
          return;
        }
        const newWarningEnabled = !guildConfig.warning_enabled;
        await client.db
          .query('GuildConfigurable')
          .where({ guildId })
          .update({ warning_enabled: newWarningEnabled, modLogId: warningChannel.id });
        await interaction.editReply(`Warning system has been ${newWarningEnabled ? 'enabled' : 'disabled'}.`);
        break;
      }
      case 'image_archive': {
        const newImageArchiveEnabled = !guildConfig.image_archive_enabled;
        await client.db
          .query('GuildConfigurable')
          .where({ guildId })
          .update({ image_archive_enabled: newImageArchiveEnabled });
        await interaction.editReply(`Image archive has been ${newImageArchiveEnabled ? 'enabled' : 'disabled'}.`);
        break;
      }
      case 'level_up_message': {
        const levelUpChannel = interaction.options.getChannel('level_up_channel');
        if (!levelUpChannel) {
          await interaction.editReply('Please choose a channel to send the level up message.');
          return;
        }
        const newLevelUpEnabled = !guildConfig.level_up_enabled;
        await client.db
          .query('GuildConfigurable')
          .where({ guildId })
          .update({ level_up_enabled: newLevelUpEnabled, level_up_channel: levelUpChannel.id });
        await interaction.editReply(`Level up message has been ${newLevelUpEnabled ? 'enabled' : 'disabled'}.`);
        break;
      }
      default:
        await interaction.editReply('Invalid option selected.');
    }
  } catch (error) {
    client.logger.error('Error executing the settings command:', error);
    await interaction.editReply('Something went wrong.');
  }
}

async function getCommandSettings(db, page) {
  const itemsPerPage = 10;
  const offset = (page - 1) * itemsPerPage;
  return db.getCommandSettings(itemsPerPage, offset);
}

function createCommandSettingsEmbed(totalCommands, commands, currentPage, totalPages) {
  const fields = commands.map((command) => ({
    name: `Command: ${command.name}`,
    value: `Channel: ${command.channel_id === 'all' ? 'All Channels' : `<#${command.channel_id}>`}`,
    inline: true,
  }));

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('Command Settings')
    .setDescription(`There are a total of **${totalCommands}** commands.`)
    .addFields(fields)
    .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
    .setTimestamp();
}

async function channelSettingsExecute(client, interaction) {
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    return interaction.editReply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  const pageRequested = interaction.options.getInteger('page') || 1;

  try {
    const [totalCommandsResult, commands] = await Promise.all([
      client.db.query('command_settings').count('* as total_commands'),
      getCommandSettings(client.db, pageRequested),
    ]);

    const totalCommands = totalCommandsResult[0].total_commands;
    const itemsPerPage = 10;
    const totalPages = Math.ceil(totalCommands / itemsPerPage) || 1;
    const currentPage = Math.min(Math.max(pageRequested - 1, 0), totalPages - 1);

    const embed = createCommandSettingsEmbed(totalCommands, commands, currentPage, totalPages);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    client.logger.error('Error:', error);
    await interaction.editReply({ content: 'An error occurred while processing the command.', ephemeral: true });
  }
}

function standardizeDate(dateInput) {
  const formats = [
    'YYYY-MM-DD',
    'DD-MM-YYYY',
    'D-M-YYYY',
    'D-MM-YYYY',
    'DD-M-YYYY',
    'YY-MM-DD',
    'DD-MM-YY',
    'D-M-YY',
    'D-MM-YY',
    'DD-M-YY',
    'YYYY-M-D',
    'YY-M-D',
    'YYYY-MM-D',
    'YY-MM-D',
    'DD-MMM-YYYY',
    'DD-MMM-YY',
    'D-MMM-YYYY',
    'D-MMM-YY',
    'M-D-YYYY',
    'MM-DD-YYYY',
    'M-D-YY',
    'MM-DD-YY',
  ];

  const processedInput = dateInput.replace(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/, (match, p1, p2, p3) => {
    const a = p1.padStart(2, '0');
    const b = p2.padStart(2, '0');
    let y = p3;
    if (y.length === 2) y = `20${y}`;
    return `${a}-${b}-${y}`;
  });

  const parsedDate = moment(processedInput, formats, true);

  if (parsedDate.isValid()) {
    if (parsedDate.year() < 1900 || parsedDate.year() > 2100) {
      return null;
    }
    return parsedDate.format('YYYY-MM-DD');
  }

  return null;
}

async function getStatsByDate(db, date) {
  return db('channel_stats').select('channel_name', 'total').where({ month_day: date }).orderBy('total', 'desc').limit(5);
}

async function getStatsByMonthYear(db, month, year) {
  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
  return db('channel_stats')
    .select('channel_name')
    .sum('total as total')
    .whereBetween('month_day', [startDate, endDate])
    .groupBy('channel_id')
    .orderBy('total', 'desc')
    .limit(5);
}

async function getTopChannels(db) {
  return db('channel_stats')
    .select('channel_name')
    .sum('total as total')
    .groupBy('channel_name')
    .orderBy('total', 'desc')
    .limit(5);
}

async function channelStatsExecute(client, interaction) {
  const dbq = client.db.query;

  try {
    const dateInput = interaction.options.getString('date');
    const month = interaction.options.getInteger('month');
    const year = interaction.options.getInteger('year');

    let result;
    const embed = new EmbedBuilder().setColor('#0099ff');

    if (!dateInput && !month && !year) {
      embed.setDescription(
        'No date, month, or year provided. Please provide one of these to search for channel statistics.',
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (dateInput) {
      const standardizedDate = standardizeDate(dateInput);
      if (!standardizedDate) {
        embed.setDescription('Invalid date format. Please use YYYY-MM-DD, DD-MM-YYYY, or similar formats.');
      } else {
        result = await getStatsByDate(dbq, standardizedDate);
        if (result.length === 0) {
          embed.setDescription(`No data found for ${standardizedDate}`);
        } else {
          embed
            .setTitle(`Channel Stats for ${standardizedDate}`)
            .addFields(result.map((r) => ({ name: r.channel_name, value: `Total: ${r.total}` })));
        }
      }
    } else if (month && year) {
      result = await getStatsByMonthYear(dbq, month, year);
      if (result.length === 0) {
        embed.setDescription(`No data found for ${month}/${year}`);
      } else {
        embed
          .setTitle(`Channel Stats for ${month}/${year}`)
          .addFields(result.map((r) => ({ name: r.channel_name, value: `Total: ${r.total}` })));
      }
    } else {
      result = await getTopChannels(dbq);
      embed.setTitle('Top 5 Channels').addFields(result.map((r) => ({ name: r.channel_name, value: `Total: ${r.total}` })));
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    client.logger.error('Error in channel_stats command:', error);
    await interaction.editReply('An error occurred while fetching channel stats.');
  }
}

async function copyChannelExecute(client, interaction) {
  if (!interaction.inGuild()) {
    return interaction.editReply({ content: 'This command can only be used in a server.', ephemeral: true });
  }
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    return interaction.editReply({
      content: 'You need Administrator permission or the configured staff role.',
      ephemeral: true,
    });
  }

  const source = interaction.options.getChannel('to_copy', true);
  const newName = interaction.options.getString('new_name', true).trim();

  if (!newName) {
    return interaction.editReply({ content: 'Channel name cannot be empty.', ephemeral: true });
  }
  if (source.isThread()) {
    return interaction.editReply({ content: 'You can only copy server channels, not threads.', ephemeral: true });
  }
  if (source.guildId !== interaction.guildId) {
    return interaction.editReply({ content: 'The channel must be in this server.', ephemeral: true });
  }

  const isVoice = source.type === ChannelType.GuildVoice || source.type === ChannelType.GuildStageVoice;
  const me = interaction.client.user;
  const perms = source.permissionsFor(me);
  if (!perms) {
    return interaction.editReply({
      content: 'Could not read permissions for that channel. Ensure the bot is in the server.',
      ephemeral: true,
    });
  }
  const required = isVoice
    ? PermissionFlagsBits.ManageChannels | PermissionFlagsBits.Connect
    : PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels;
  if (!perms.has(required)) {
    return interaction.editReply({
      content: `I need **Manage Channels** and **${isVoice ? 'Connect' : 'View Channel'}** on that channel to duplicate it.`,
      ephemeral: true,
    });
  }

  const reason = `Channel copy from #${source.name} (requested by ${interaction.user.tag})`;

  try {
    const created = await source.clone({ name: newName, reason });

    if (source.isThreadOnly()) {
      const edit = {};
      if (source.availableTags?.length) {
        edit.availableTags = source.availableTags.map(forumTagToData);
      }
      if (source.defaultReactionEmoji) {
        const d = source.defaultReactionEmoji;
        if (d.id != null || d.name != null) {
          edit.defaultReactionEmoji = { id: d.id, name: d.name };
        }
      }
      if (source.defaultSortOrder != null) {
        edit.defaultSortOrder = source.defaultSortOrder;
      }
      if (source.defaultForumLayout != null) {
        edit.defaultForumLayout = source.defaultForumLayout;
      }
      if (source.defaultThreadRateLimitPerUser != null) {
        edit.defaultThreadRateLimitPerUser = source.defaultThreadRateLimitPerUser;
      }
      if (source.defaultAutoArchiveDuration != null) {
        edit.defaultAutoArchiveDuration = source.defaultAutoArchiveDuration;
      }
      if (Object.keys(edit).length > 0) {
        await created.edit({ ...edit, reason });
      }
    }

    return interaction.editReply({
      content: `Created ${created} — duplicate of <#${source.id}> as **${newName}**.`,
    });
  } catch (err) {
    client.logger.error('copy_channel error:', err);
    const code = err?.code;
    if (code === 50013) {
      return interaction.editReply({ content: 'I do not have permission to create or edit that channel.', ephemeral: true });
    }
    if (code === 30016) {
      return interaction.editReply({ content: 'This server has reached the maximum number of channels.', ephemeral: true });
    }
    return interaction.editReply({
      content: 'Failed to copy the channel. Check the bot can manage channels and the name is valid.',
      ephemeral: true,
    });
  }
}

module.exports = {
  serverSettingsExecute,
  channelSettingsExecute,
  channelStatsExecute,
  copyChannelExecute,
  updateCommandSettingsExecute,
  fetchAndChunkChoices,
  augmentUpdateCommandSubcommand,
};
