const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');
const { enforceBlacklist } = require('./invitePolicy');

function isModMember(member, staffRoleId) {
  return hasGuildAdminOrStaffRole(member, staffRoleId);
}

async function denyButton(interaction, text) {
  try {
    await interaction.deferUpdate();
  } catch (_) {
    /* ignore */
  }
  try {
    await interaction.followUp({ content: text, ephemeral: true });
  } catch (_) {
    /* ignore */
  }
}

async function handleInviteQueueButton(client, interaction, action, pendingId) {
  const staffRoleId = client.config.roles.staff;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !isModMember(member, staffRoleId)) {
    return denyButton(interaction, 'You do not have permission to use this action.');
  }

  const row = await client.db.getPendingInviteById(pendingId);
  if (!row || row.home_guild_id !== interaction.guildId) {
    return denyButton(interaction, 'This review request is invalid or for another server.');
  }

  const newStatus = action === 'approve' ? 'approved' : 'blacklisted';
  const affected = await client.db.claimPendingInviteStatus(pendingId, newStatus, interaction.user.id);
  if (affected !== 1) {
    await interaction.deferUpdate().catch(() => {});
    return interaction.followUp({ content: 'This invite was already reviewed.', ephemeral: true }).catch(() => {});
  }

  try {
    await interaction.deferUpdate();
  } catch (_) {
    /* ignore */
  }

  if (action === 'approve') {
    await client.db.sql(
      `INSERT INTO whitelisted_invites (home_guild_id, code, resolved_guild_id, approved_by)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE resolved_guild_id = VALUES(resolved_guild_id), approved_by = VALUES(approved_by)`,
      [row.home_guild_id, row.invite_code, row.resolved_guild_id, interaction.user.id],
    );
    if (row.resolved_guild_id) {
      await client.db.sql(
        `INSERT INTO whitelisted_guilds (home_guild_id, target_guild_id, guild_name, approved_by)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), approved_by = VALUES(approved_by)`,
        [
          row.home_guild_id,
          row.resolved_guild_id,
          row.resolved_guild_name,
          interaction.user.id,
        ],
      );
    }

    const origCh =
      interaction.guild.channels.cache.get(row.channel_id) ||
      (await interaction.guild.channels.fetch(row.channel_id).catch(() => null));
    if (origCh && origCh.isTextBased()) {
      await origCh
        .send(
          `<@${row.author_id}> your invite was **approved** by staff — you may post it again if you still have it.`,
        )
        .catch(() => {});
    }
  } else {
    await client.db.sql(
      `INSERT INTO blacklisted_invites (code, resolved_guild_id, reason, added_by)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE resolved_guild_id = VALUES(resolved_guild_id), reason = VALUES(reason), added_by = VALUES(added_by)`,
      [row.invite_code, row.resolved_guild_id, 'Staff blacklist from queue', interaction.user.id],
    );
    if (row.resolved_guild_id) {
      await client.db.sql(
        `INSERT INTO blacklisted_guilds (guild_id, guild_name, reason, added_by)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), reason = VALUES(reason), added_by = VALUES(added_by)`,
        [
          row.resolved_guild_id,
          row.resolved_guild_name,
          'Staff blacklist from queue',
          interaction.user.id,
        ],
      );
    }

    const user = await client.users.fetch(row.author_id).catch(() => null);
    const pseudoMessage = {
      author: user || { id: row.author_id, username: 'user', discriminator: '0000' },
      guild: interaction.guild,
      channelId: row.channel_id,
      content: row.invite_code,
    };
    await enforceBlacklist(client, pseudoMessage, `queue blacklist ${row.invite_code}`, staffRoleId);
  }

  if (row.queue_message_id) {
    const msg = await interaction.channel.messages.fetch(row.queue_message_id).catch(() => null);
    if (msg && msg.embeds[0]) {
      const embed = EmbedBuilder.from(msg.embeds[0])
        .setColor(action === 'approve' ? 0x00ff00 : 0xff0000)
        .addFields({
          name: 'Resolution',
          value: `${action === 'approve' ? 'Approved' : 'Blacklisted'} by ${interaction.user.tag}`,
        });
      await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }
  }
}

function resolutionLabel(action) {
  if (action === 'approve') return 'Approved';
  if (action === 'ban') return 'Banned';
  return 'Dismissed';
}

async function annotateQueueMessage(client, channel, queueMessageId, resolutionText) {
  if (!queueMessageId || !channel) return;
  let msg;
  try {
    msg = await channel.messages.fetch(queueMessageId);
  } catch (e) {
    client.logger.warn(
      `imageReview: cannot fetch queue message ${queueMessageId} in channel ${channel.id} (code=${e?.code || 'unknown'}): ${e?.message || e}`,
    );
    return;
  }
  if (!msg) return;
  const base = msg.embeds[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setTitle('Image review');
  base.addFields({ name: 'Resolution', value: resolutionText });
  try {
    await msg.edit({ embeds: [base], components: [] });
  } catch (e) {
    client.logger.warn(
      `imageReview: cannot edit queue message ${queueMessageId} in channel ${channel.id} (code=${e?.code || 'unknown'}): ${e?.message || e}`,
    );
  }
}

async function handleImageReviewButton(client, interaction, action, pendingId) {
  const staffRoleId = client.config.roles.staff;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !isModMember(member, staffRoleId)) {
    return denyButton(interaction, 'You do not have permission to use this action.');
  }

  const row = await client.db.getPendingImageReviewById(pendingId);
  if (!row || row.home_guild_id !== interaction.guildId) {
    return denyButton(interaction, 'Invalid image review.');
  }

  const nextStatus =
    action === 'approve' ? 'approved' : action === 'ban' ? 'banned' : 'dismissed';
  const affected = await client.db.claimPendingImageReviewStatus(pendingId, nextStatus, interaction.user.id);
  if (affected !== 1) {
    await interaction.deferUpdate().catch(() => {});
    return interaction.followUp({ content: 'Already reviewed.', ephemeral: true }).catch(() => {});
  }

  try {
    await interaction.deferUpdate();
  } catch (_) {
    /* ignore */
  }

  if (action === 'approve') {
    await client.db.upsertImageReviewApproval(row.home_guild_id, row.author_id, interaction.user.id);
  } else if (action === 'ban') {
    try {
      await interaction.guild.members.ban(row.author_id, {
        deleteMessageSeconds: 3600,
        reason: 'Image review: banned by moderator',
      });
    } catch (e) {
      client.logger.error(
        `imageReview: ban of ${row.author_id} failed (code=${e?.code || 'unknown'}): ${e?.message || e}`,
        e,
      );
      try {
        await interaction.followUp({
          content: `Ban failed: ${e?.message || 'unknown error'}`,
          ephemeral: true,
        });
      } catch (_) { /* ignore */ }
    }
  }

  // Cascade-resolve other pending entries for the same user when the action
  // is a terminal one for that user (approved or banned). Dismiss only closes
  // this single entry.
  let cascaded = [];
  if (action === 'approve' || action === 'ban') {
    cascaded = await client.db.listOtherPendingImageReviewsByAuthor(
      row.home_guild_id,
      row.author_id,
      pendingId,
    );
    if (cascaded.length) {
      await client.db.resolveOtherPendingImageReviewsByAuthor(
        row.home_guild_id,
        row.author_id,
        pendingId,
        nextStatus,
        interaction.user.id,
      );
    }
  }

  const primaryResolution = `${resolutionLabel(action)} by ${interaction.user.tag}`;
  await annotateQueueMessage(client, interaction.channel, row.queue_message_id, primaryResolution);

  if (cascaded.length) {
    const cascadeResolution = `Auto-${resolutionLabel(action).toLowerCase()} (resolved with review #${pendingId} by ${interaction.user.tag})`;
    for (const other of cascaded) {
      await annotateQueueMessage(client, interaction.channel, other.queue_message_id, cascadeResolution);
    }
    try {
      await interaction.followUp({
        content: `Also auto-resolved ${cascaded.length} other pending review(s) for the same user.`,
        ephemeral: true,
      });
    } catch (_) { /* ignore */ }
  }
}

async function handleModerationButton(client, interaction) {
  if (!interaction.isButton() || !interaction.customId) return false;
  const id = interaction.customId;
  if (id.startsWith('invq:')) {
    const [, action, rawId] = id.split(':');
    const pendingId = parseInt(rawId, 10);
    if (!pendingId || (action !== 'approve' && action !== 'blacklist')) return true;
    await handleInviteQueueButton(client, interaction, action, pendingId);
    return true;
  }
  if (id.startsWith('imgrev:')) {
    const [, action, rawId] = id.split(':');
    const pendingId = parseInt(rawId, 10);
    if (!pendingId || (action !== 'approve' && action !== 'ban' && action !== 'dismiss')) return true;
    await handleImageReviewButton(client, interaction, action, pendingId);
    return true;
  }
  return false;
}

module.exports = { handleModerationButton };
