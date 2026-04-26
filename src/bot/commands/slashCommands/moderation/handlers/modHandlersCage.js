const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const moment = require('moment');

async function cageApplyExecute(client, interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.editReply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  const userToCage = interaction.options.getUser('user');
  const duration = interaction.options.getString('duration');
  const guildMember = await interaction.guild.members.fetch(userToCage.id);
  const reason = interaction.options.getString('reason');
  const cageValue = interaction.options.getString('cage_type');

  if (!guildMember) {
    return interaction.editReply({ content: 'User not found in this server.', ephemeral: true });
  }

  const cageRole = interaction.guild.roles.cache.find((role) => role.id === cageValue);
  if (!cageRole) {
    return interaction.editReply({ content: `Cage role: ${cageValue} does not exist.`, ephemeral: true });
  }

  const cageName = interaction.guild.roles.cache.get(cageValue);

  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.editReply({ content: 'I do not have permission to manage roles.', ephemeral: true });
  }

  const botRole = interaction.guild.members.me.roles.highest;
  if (guildMember.roles.highest.position >= botRole.position) {
    return interaction.editReply({
      content: 'I cannot cage this user because their role is higher than or equal to mine.',
      ephemeral: true,
    });
  }

  const parseDuration = (input) => {
    const match = input.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return null;
    }
  };

  let expires = 0;
  if (duration) {
    const durationInSeconds = parseDuration(duration);
    if (!durationInSeconds) {
      return interaction.editReply({
        content: 'Invalid duration format. Use something like 1h, 30m, or 1d.',
        ephemeral: true,
      });
    }
    expires = moment().unix() + durationInSeconds;
  }

  await client.db.createCage(
    userToCage.id,
    expires,
    interaction.user.tag,
    interaction.user.id,
    client.utils.timestamp(),
    reason,
    cageValue,
  );

  await guildMember.roles.add(cageValue);
  await interaction.editReply({
    content: `<@${userToCage.id}> has been caged with role: ${cageName.name} successfully.`,
  });

  const expiresText = expires === 0 ? 'Permanent' : `<t:${expires}:R>`;

  const modChannel = interaction.guild.channels.cache.find((ch) => ch.name === 'moderator-chat');
  const modEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('User Caged')
    .addFields([
      { name: 'User', value: `<@${userToCage.id}>`, inline: true },
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Expires', value: expiresText, inline: false },
      { name: 'Reason', value: reason, inline: false },
      { name: 'Cage Type', value: cageName.name, inline: false },
    ])
    .setTimestamp();

  if (modChannel) {
    await modChannel.send({ embeds: [modEmbed] });
  } else {
    client.logger.error('Moderator chat channel not found!');
  }
}

async function cageRemoveExecute(client, interaction) {
  const userToUncage = interaction.options.getUser('user');

  const cageRoleId = await client.db.getCageRoleId(userToUncage.id);
  const cageRole = interaction.guild.roles.cache.find((role) => role.id === cageRoleId);
  if (!cageRole) {
    return interaction.editReply({ content: 'Caged role does not exist.', ephemeral: true });
  }

  const cagedUser = await client.db.getCage(userToUncage.id);

  if (!cagedUser) {
    return interaction.editReply({ content: 'This user is not currently caged.', ephemeral: true });
  }

  const guildMember = await interaction.guild.members.fetch(userToUncage.id);

  if (!guildMember) {
    return interaction.editReply({ content: 'User not found in the guild.', ephemeral: true });
  }

  await client.db.removeCage(userToUncage.id);
  await guildMember.roles.remove(cageRoleId);

  const embed = new EmbedBuilder()
    .setTitle('Cage Removed')
    .setDescription(`${userToUncage.tag}'s cage has been removed and their roles have been restored.`)
    .setColor('#00FF00');

  await interaction.editReply({ embeds: [embed] });
}

async function cageListExecute(client, interaction) {
  const cagedUsers = await client.db.getCagedUsers(client.utils.timestamp());

  if (!cagedUsers) {
    return interaction.editReply('No active caged users found.');
  }

  const embed = new EmbedBuilder()
    .setTitle('Currently Caged Users')
    .setColor('#FF0000')
    .setFooter({ text: 'Displaying up to 5 caged users' });

  const guild = interaction.guild;

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

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { cageApplyExecute, cageRemoveExecute, cageListExecute };
