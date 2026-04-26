const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');

function pickImageAttachment(message) {
  for (const a of message.attachments.values()) {
    const ct = a.contentType || '';
    if (ct.startsWith('image/')) return a;
    const n = (a.name || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n)) return a;
  }
  return null;
}

function daysBetween(d1, d2) {
  return Math.floor((d2 - d1) / 86400000);
}

/**
 * @returns {boolean} true if this message should be held for image review
 */
async function shouldFlagImageForReview(client, message, staffRoleId) {
  const att = pickImageAttachment(message);
  if (!att) return false;

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return false;
  if (hasGuildAdminOrStaffRole(member, staffRoleId)) return false;

  const gid = message.guild.id;
  const uid = message.author.id;
  if (await client.db.hasImageReviewApproval(gid, uid)) return false;

  const cfg = await client.db.getGuildConfigurable(gid);
  const minAcc = cfg.min_account_age_days != null ? Number(cfg.min_account_age_days) : null;
  const minJoin = cfg.min_join_age_days != null ? Number(cfg.min_join_age_days) : null;
  const minMsg = cfg.min_messages_for_image_trust != null ? Number(cfg.min_messages_for_image_trust) : null;

  const created = message.author.createdAt;
  const joined = member.joinedAt;
  const now = new Date();

  const accountOk = minAcc == null || !created || daysBetween(created, now) >= minAcc;
  const joinOk = minJoin == null || !joined || daysBetween(joined, now) >= minJoin;
  const veteranByAge = accountOk && joinOk;

  if (!accountOk || !joinOk) return true;

  if (veteranByAge) return false;

  if (minMsg != null && minMsg > 0) {
    const count = await client.db.getGuildUserMessageCount(gid, uid);
    if (count < minMsg) return true;
  }

  return false;
}

function reviewChannelId(cfg) {
  return cfg.image_review_channel_id || cfg.modLogId || null;
}

function buildImageReviewComponents(pendingId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`imgrev:approve:${pendingId}`)
      .setLabel('Approve member')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`imgrev:ban:${pendingId}`)
      .setLabel('Ban user')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Delete message, queue staff review for first image attachment.
 */
async function processImageReview(client, message, staffRoleId) {
  const att = pickImageAttachment(message);
  if (!att) return;

  const flag = await shouldFlagImageForReview(client, message, staffRoleId);
  if (!flag) return;

  const gid = message.guild.id;
  const cfg = await client.db.getGuildConfigurable(gid);
  const chId = reviewChannelId(cfg);
  if (!chId) {
    client.logger.warn('imageReview: no image_review_channel_id or modLogId');
    return;
  }

  const attachmentUrl = att.url;
  const content = message.content || '';

  const pendingId = await client.db.insertPendingImageReview({
    home_guild_id: gid,
    author_id: message.author.id,
    channel_id: message.channelId,
    attachment_url: attachmentUrl.slice(0, 500),
    message_content: content.slice(0, 1900),
    status: 'pending',
  });

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  const created = message.author.createdAt;
  const joined = member?.joinedAt;
  const now = new Date();
  const accountAgeDays = created ? daysBetween(created, now) : '—';
  const joinAgeDays = joined ? daysBetween(joined, now) : '—';
  const msgCount = await client.db.getGuildUserMessageCount(gid, message.author.id);

  const embed = new EmbedBuilder()
    .setTitle('Image flagged for review')
    .setColor(0xffa500)
    .setImage(attachmentUrl)
    .addFields(
      { name: 'User', value: `${message.author.tag} (${message.author.id})` },
      { name: 'Channel', value: `<#${message.channelId}>` },
      { name: 'Account age (days)', value: String(accountAgeDays) },
      { name: 'Join age (days)', value: String(joinAgeDays) },
      { name: 'Message count', value: String(msgCount) },
      { name: 'Content', value: content.slice(0, 900) || '*(none)*' },
      { name: 'Pending id', value: String(pendingId) },
    )
    .setTimestamp();

  try {
    await message.delete();
  } catch (_) {
    /* ignore */
  }

  const reviewCh =
    message.guild.channels.cache.get(chId) || (await message.guild.channels.fetch(chId).catch(() => null));
  if (!reviewCh || !reviewCh.isTextBased()) return;

  const row = buildImageReviewComponents(pendingId);
  const qMsg = await reviewCh.send({ embeds: [embed], components: [row] }).catch((e) => {
    client.logger.error('imageReview queue send failed', e);
    return null;
  });
  if (qMsg) {
    await client.db.updatePendingImageReviewQueueMessage(pendingId, qMsg.id);
  }
}

module.exports = {
  pickImageAttachment,
  processImageReview,
  shouldFlagImageForReview,
  reviewChannelId,
  buildImageReviewComponents,
};
