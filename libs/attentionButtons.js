const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');

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

function canResolveModLane(member, modRoleId) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const id = typeof modRoleId === 'string' ? modRoleId.trim() : '';
  return Boolean(id && member.roles.cache.has(id));
}

function canResolveStaffLane(member, staffRoleId) {
  return hasGuildAdminOrStaffRole(member, staffRoleId);
}

function actionToStatus(action) {
  if (action === 'handle') return 'handled';
  if (action === 'rejected') return 'rejected';
  if (action === 'dismiss') return 'dismissed';
  return null;
}

function statusPingWord(status) {
  if (status === 'handled') return 'Handled';
  if (status === 'rejected') return 'Rejected';
  if (status === 'dismissed') return 'Dismissed';
  return 'Updated';
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if this was an attention button and was consumed
 */
async function handleAttentionButton(client, interaction) {
  if (!interaction.isButton() || !interaction.customId?.startsWith('attn:')) return false;
  const parts = interaction.customId.split(':');
  if (parts.length !== 3 || parts[0] !== 'attn') return false;
  const action = parts[1];
  const id = parseInt(parts[2], 10);
  const status = actionToStatus(action);
  if (!status || !id) return false;

  const row = await client.db.getAttentionRequestById(id);
  if (!row || row.guild_id !== interaction.guildId) {
    await denyButton(interaction, 'This attention request is invalid or belongs to another server.');
    return true;
  }

  const modRoleId = client.config?.roles?.mod;
  const staffRoleId = client.config?.roles?.staff;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (row.lane === 'mod') {
    if (!canResolveModLane(member, modRoleId)) {
      return denyButton(interaction, 'You do not have permission to resolve mod-queue attention requests.');
    }
  } else if (row.lane === 'staff') {
    if (!canResolveStaffLane(member, staffRoleId)) {
      return denyButton(interaction, 'You do not have permission to resolve staff-queue attention requests.');
    }
  } else {
    return denyButton(interaction, 'Unknown queue type.');
  }

  const affected = await client.db.claimAttentionRequestStatus(id, status, interaction.user.id);
  if (affected !== 1) {
    await interaction.deferUpdate().catch(() => {});
    await interaction.followUp({ content: 'This request was already resolved.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }

  try {
    await interaction.deferUpdate();
  } catch (_) {
    /* ignore */
  }

  const queueChannelId = row.queue_channel_id || interaction.channelId;
  const queueChannel =
    interaction.guild.channels.cache.get(queueChannelId) ||
    (await interaction.guild.channels.fetch(queueChannelId).catch(() => null));

  const pingChannelIdRaw =
    row.source_channel_id != null && String(row.source_channel_id).trim() !== ''
      ? String(row.source_channel_id).trim()
      : queueChannelId;
  const pingChannel =
    interaction.guild.channels.cache.get(pingChannelIdRaw) ||
    (await interaction.guild.channels.fetch(pingChannelIdRaw).catch(() => null));

  const word = statusPingWord(status);
  const laneLabel = row.lane === 'mod' ? 'mod' : 'staff';
  const pingContent = `<@${row.author_id}> Your attention request (**${laneLabel}** queue) was **${word}** by ${interaction.user}.`;

  if (pingChannel && pingChannel.isTextBased()) {
    await pingChannel.send({ content: pingContent }).catch((e) =>
      client.logger.warn(`attention: ping author in source channel failed: ${e?.message || e}`),
    );
  } else {
    client.logger.warn(
      `attention: could not resolve ping channel ${pingChannelIdRaw} for request ${id}; author may not be notified.`,
    );
  }

  if (queueChannel && queueChannel.isTextBased() && row.queue_message_id) {
    const msg = await queueChannel.messages.fetch(row.queue_message_id).catch(() => null);
    if (msg && msg.embeds[0]) {
      const embed = EmbedBuilder.from(msg.embeds[0]).addFields({
        name: 'Resolution',
        value: `${word} by ${interaction.user.tag}`,
      });
      await msg.edit({ embeds: [embed], components: [] }).catch((e) =>
        client.logger.warn(`attention: edit queue message failed: ${e?.message || e}`),
      );
    }
  }

  return true;
}

module.exports = { handleAttentionButton };
