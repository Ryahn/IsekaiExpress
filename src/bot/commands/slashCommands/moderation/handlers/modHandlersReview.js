const { EmbedBuilder } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../../../../utils/guildPrivileges');

async function assertStaff(interaction, client) {
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    await interaction.editReply({ content: 'You need the staff role or Administrator.', ephemeral: true });
    return false;
  }
  return true;
}

async function reviewSetExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const guildId = interaction.guildId;
  const patch = {};

  const imgCh = interaction.options.getChannel('image_review_channel');
  if (imgCh) patch.image_review_channel_id = imgCh.id;

  const invCh = interaction.options.getChannel('invite_queue_channel');
  if (invCh) patch.invite_queue_channel_id = invCh.id;

  const minAcc = interaction.options.getInteger('min_account_age_days');
  if (minAcc !== null) patch.min_account_age_days = minAcc;

  const minJoin = interaction.options.getInteger('min_join_age_days');
  if (minJoin !== null) patch.min_join_age_days = minJoin;

  const minMsg = interaction.options.getInteger('min_messages_for_image_trust');
  if (minMsg !== null) patch.min_messages_for_image_trust = minMsg;

  const clearModLogPing = interaction.options.getBoolean('mod_log_ping_clear');
  const modLogPingRole = interaction.options.getRole('mod_log_ping_role');
  if (clearModLogPing === true) {
    patch.mod_log_ping_role_id = null;
  } else if (modLogPingRole) {
    patch.mod_log_ping_role_id = modLogPingRole.id;
  }

  if (!Object.keys(patch).length) {
    return interaction.editReply({ content: 'Provide at least one option to update.', ephemeral: true });
  }

  await client.db.query('GuildConfigurable').where({ guildId }).update(patch);
  await interaction.editReply(`Updated review settings: ${Object.keys(patch).join(', ')}`);
}

async function reviewViewExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const row = await client.db.getGuildConfigurable(interaction.guildId);
  const embed = new EmbedBuilder()
    .setTitle('Moderation review settings')
    .setColor(0x3498db)
    .addFields(
      { name: 'image_review_channel_id', value: row.image_review_channel_id || '—', inline: true },
      { name: 'invite_queue_channel_id', value: row.invite_queue_channel_id || '—', inline: true },
      { name: 'modLogId', value: row.modLogId || '—', inline: true },
      {
        name: 'mod_log_ping_role_id',
        value: row.mod_log_ping_role_id ? `<@&${row.mod_log_ping_role_id}> (${row.mod_log_ping_role_id})` : '—',
        inline: true,
      },
      { name: 'min_account_age_days', value: String(row.min_account_age_days ?? '—'), inline: true },
      { name: 'min_join_age_days', value: String(row.min_join_age_days ?? '—'), inline: true },
      { name: 'min_messages_for_image_trust', value: String(row.min_messages_for_image_trust ?? '—'), inline: true },
    );
  await interaction.editReply({ embeds: [embed] });
}

async function reviewApproveUserExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const user = interaction.options.getUser('user', true);
  await client.db.upsertImageReviewApproval(interaction.guildId, user.id, interaction.user.id);
  await interaction.editReply(`Image review bypass granted to ${user.tag}.`);
}

async function reviewRevokeUserExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const user = interaction.options.getUser('user', true);
  await client.db.deleteImageReviewApproval(interaction.guildId, user.id);
  await interaction.editReply(`Image review bypass removed for ${user.tag}.`);
}

module.exports = {
  reviewSetExecute,
  reviewViewExecute,
  reviewApproveUserExecute,
  reviewRevokeUserExecute,
};
