const { MessageFlags } = require('discord.js');
const { hasGuildAdminOrModRole } = require('../src/bot/utils/guildPrivileges');
const { enforceBlacklist } = require('./invitePolicy');
const { recordModerationAction } = require('./moderationActionLog');

function canModerateQueue(member, staffRoleId, modRoleId) {
  return hasGuildAdminOrModRole(member, staffRoleId, modRoleId);
}

async function denyButton(interaction, text) {
  try {
    await interaction.deferUpdate();
  } catch (_) {
    /* ignore */
  }
  try {
    await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
  } catch (_) {
    /* ignore */
  }
}

async function handleInviteQueueButton(client, interaction, action, pendingId) {
  const staffRoleId = client.config.roles.staff;
  const modRoleId = client.config.roles.mod;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !canModerateQueue(member, staffRoleId, modRoleId)) {
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
    return interaction.followUp({ content: 'This invite was already reviewed.', flags: MessageFlags.Ephemeral }).catch(() => {});
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
    await enforceBlacklist(client, pseudoMessage, `queue blacklist ${row.invite_code}`, staffRoleId, modRoleId);
  }

  await finalizeHistory(
    client,
    row.moderation_history_id,
    {
      guildId: row.home_guild_id,
      eventType: 'invite_review',
      subjectType: 'invite',
      subjectId: row.invite_code,
      authorId: row.author_id,
      channelId: row.channel_id,
      queueMessageId: row.queue_message_id,
      status: 'handled',
      action: newStatus,
      handledBy: interaction.user.id,
      handledAt: new Date(),
      summary: `Discord invite ${row.invite_code} ${newStatus} by ${interaction.user.tag}`,
      metadata: {
        pendingInviteId: row.id,
        resolvedGuildId: row.resolved_guild_id || null,
        resolvedGuildName: row.resolved_guild_name || null,
      },
    },
    {
      status: 'handled',
      action: newStatus,
      handledBy: interaction.user.id,
      summary: `Discord invite ${row.invite_code} ${newStatus} by ${interaction.user.tag}`,
      metadata: {
        pendingInviteId: row.id,
        resolvedGuildId: row.resolved_guild_id || null,
        resolvedGuildName: row.resolved_guild_name || null,
      },
    },
  );

  await deleteQueueMessage(client, interaction.channel, row.queue_message_id, 'inviteQueue');
}

function resolutionLabel(action) {
  if (action === 'approve') return 'Approved';
  if (action === 'ban') return 'Banned';
  return 'Dismissed';
}

async function deleteQueueMessage(client, channel, queueMessageId, context) {
  if (!queueMessageId || !channel) return;
  let msg;
  try {
    msg = await channel.messages.fetch(queueMessageId);
  } catch (e) {
    client.logger.warn(
      `${context}: cannot fetch queue message ${queueMessageId} in channel ${channel.id} (code=${e?.code || 'unknown'}): ${e?.message || e}`,
    );
    return;
  }
  if (!msg) return;
  try {
    await msg.delete();
  } catch (e) {
    client.logger.warn(
      `${context}: cannot delete queue message ${queueMessageId} in channel ${channel.id} (code=${e?.code || 'unknown'}): ${e?.message || e}`,
    );
  }
}

async function finalizeHistory(client, historyId, fallbackEntry, update) {
  let targetHistoryId = historyId;
  if (!targetHistoryId && fallbackEntry && typeof client.db.createModerationReviewHistory === 'function') {
    targetHistoryId = await client.db.createModerationReviewHistory(fallbackEntry);
  }
  if (targetHistoryId && typeof client.db.finalizeModerationReviewHistory === 'function') {
    await client.db.finalizeModerationReviewHistory(targetHistoryId, update);
  }
  return targetHistoryId;
}

async function handleImageReviewButton(client, interaction, action, pendingId) {
  const staffRoleId = client.config.roles.staff;
  const modRoleId = client.config.roles.mod;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !canModerateQueue(member, staffRoleId, modRoleId)) {
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
    return interaction.followUp({ content: 'Already reviewed.', flags: MessageFlags.Ephemeral }).catch(() => {});
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
      const deletedParts = [];
      if (row.message_content) deletedParts.push(String(row.message_content));
      if (row.attachment_url) deletedParts.push(`[image] ${row.attachment_url}`);
      await recordModerationAction(client, {
        guild: interaction.guild,
        actionType: 'ban',
        targetUserId: row.author_id,
        moderatorUserId: interaction.user.id,
        moderatorUser: interaction.user,
        channelId: row.channel_id,
        deletedContent: deletedParts.length ? deletedParts.join('\n') : null,
        reason: 'Image review: banned by moderator',
        source: 'bot_command',
        metadata: { pendingImageReviewId: row.id },
      });
    } catch (e) {
      client.logger.error(
        `imageReview: ban of ${row.author_id} failed (code=${e?.code || 'unknown'}): ${e?.message || e}`,
        e,
      );
      try {
        await interaction.followUp({
          content: `Ban failed: ${e?.message || 'unknown error'}`,
          flags: MessageFlags.Ephemeral,
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

  await finalizeHistory(
    client,
    row.moderation_history_id,
    {
      guildId: row.home_guild_id,
      eventType: 'image_review',
      subjectType: 'user',
      subjectId: row.author_id,
      authorId: row.author_id,
      channelId: row.channel_id,
      queueMessageId: row.queue_message_id,
      status: 'handled',
      action: nextStatus,
      handledBy: interaction.user.id,
      handledAt: new Date(),
      summary: `Image review ${nextStatus} by ${interaction.user.tag}`,
      metadata: {
        pendingImageReviewId: row.id,
      },
    },
    {
      status: 'handled',
      action: nextStatus,
      handledBy: interaction.user.id,
      summary: `Image review ${nextStatus} by ${interaction.user.tag}`,
      metadata: {
        pendingImageReviewId: row.id,
      },
    },
  );
  await deleteQueueMessage(client, interaction.channel, row.queue_message_id, 'imageReview');

  if (cascaded.length) {
    const cascadeResolution = `Auto-${resolutionLabel(action).toLowerCase()} (resolved with review #${pendingId} by ${interaction.user.tag})`;
    for (const other of cascaded) {
      await finalizeHistory(
        client,
        other.moderation_history_id,
        {
          guildId: row.home_guild_id,
          eventType: 'image_review',
          subjectType: 'user',
          subjectId: row.author_id,
          authorId: row.author_id,
          queueMessageId: other.queue_message_id,
          status: 'handled',
          action: `auto_${nextStatus}`,
          handledBy: interaction.user.id,
          handledAt: new Date(),
          summary: cascadeResolution,
          metadata: {
            pendingImageReviewId: other.id,
            resolvedWithPendingImageReviewId: pendingId,
          },
        },
        {
          status: 'handled',
          action: `auto_${nextStatus}`,
          handledBy: interaction.user.id,
          summary: cascadeResolution,
          metadata: {
            pendingImageReviewId: other.id,
            resolvedWithPendingImageReviewId: pendingId,
          },
        },
      );
      await deleteQueueMessage(client, interaction.channel, other.queue_message_id, 'imageReview');
    }
    try {
      await interaction.followUp({
        content: `Also auto-resolved ${cascaded.length} other pending review(s) for the same user.`,
        flags: MessageFlags.Ephemeral,
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
