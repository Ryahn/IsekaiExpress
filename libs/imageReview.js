const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');
const { scanImageAttachment, enforceScamImage, buildScamImageEvidenceEmbed } = require('./scamImageScan');
const { withModLogRolePing } = require('./modLogNotify');

function describeChannel(ch, fallbackId) {
  if (!ch) return `#${fallbackId}`;
  return ch.name ? `#${ch.name} (${ch.id})` : `#${ch.id}`;
}

function pickImageAttachment(message) {
  for (const a of message.attachments.values()) {
    const ct = a.contentType || '';
    if (ct.startsWith('image/')) return a;
    const n = (a.name || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n)) return a;
  }
  return null;
}

function listImageAttachments(message) {
  const out = [];
  for (const a of message.attachments.values()) {
    const ct = a.contentType || '';
    if (ct.startsWith('image/')) {
      out.push(a);
      continue;
    }
    const n = (a.name || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n)) out.push(a);
  }
  return out;
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

  if (!accountOk || !joinOk) return true;

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
    new ButtonBuilder()
      .setCustomId(`imgrev:dismiss:${pendingId}`)
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Build the image-review queue payload (evidence embed when a scan hit, plus image previews
 * + Approve/Ban buttons), delete the original message, and post to the review channel.
 */
async function queueImageReview(client, message, attachments, member, cfg, chId, options = {}) {
  const { scan, scanIndex } = options;
  const hasScan = !!scan;
  const gid = message.guild.id;
  const firstAtt = attachments[0];
  const content = message.content || '';

  const pendingId = await client.db.insertPendingImageReview({
    home_guild_id: gid,
    author_id: message.author.id,
    channel_id: message.channelId,
    attachment_url: firstAtt.url.slice(0, 500),
    message_content: content.slice(0, 1900),
    status: 'pending',
  });

  const created = message.author.createdAt;
  const joined = member.joinedAt;
  const now = new Date();
  const accountAgeDays = created ? daysBetween(created, now) : '—';
  const joinAgeDays = joined ? daysBetween(joined, now) : '—';
  const msgCount = await client.db.getGuildUserMessageCount(gid, message.author.id);

  const embeds = [];
  if (hasScan) {
    const idx = typeof scanIndex === 'number' ? scanIndex : 0;
    embeds.push(buildScamImageEvidenceEmbed(message, scan, idx, attachments[idx].url));
  }
  const previewBudget = hasScan ? 9 : 10;
  const maxShow = Math.min(attachments.length, previewBudget);
  for (let i = 0; i < maxShow; i++) {
    const att = attachments[i];
    const title =
      i === 0
        ? hasScan
          ? 'Scam-scan hit — staff review required'
          : 'Image flagged for review'
        : `Attachment ${i + 1} / ${attachments.length}`;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(hasScan ? 0xff4500 : 0xffa500)
      .setImage(att.url)
      .setTimestamp();
    if (i === 0) {
      embed.addFields(
        { name: 'User', value: `${message.author.tag} (${message.author.id})` },
        { name: 'Channel', value: `<#${message.channelId}>` },
        { name: 'Account age (days)', value: String(accountAgeDays) },
        { name: 'Join age (days)', value: String(joinAgeDays) },
        { name: 'Message count', value: String(msgCount) },
        { name: 'Content', value: content.slice(0, 900) || '*(none)*' },
        { name: 'Pending id', value: String(pendingId) },
      );
    }
    embeds.push(embed);
  }

  try {
    await message.delete();
  } catch (e) {
    const code = e && e.code;
    client.logger.warn(
      `imageReview: failed to delete original message in ${describeChannel(message.channel, message.channelId)}` +
        ` (code=${code || 'unknown'}): ${e.message || e}`,
    );
  }

  let reviewCh = message.guild.channels.cache.get(chId) || null;
  if (!reviewCh) {
    try {
      reviewCh = await message.guild.channels.fetch(chId);
    } catch (e) {
      client.logger.warn(
        `imageReview: cannot fetch review channel ${chId} (code=${e?.code || 'unknown'}): ${e?.message || e}`,
      );
      reviewCh = null;
    }
  }
  if (!reviewCh) {
    client.logger.warn(`imageReview: review channel ${chId} not found in guild ${message.guild.id}`);
    return;
  }
  if (!reviewCh.isTextBased()) {
    client.logger.warn(
      `imageReview: review channel ${describeChannel(reviewCh, chId)} is not text-based; cannot queue`,
    );
    return;
  }

  const row = buildImageReviewComponents(pendingId);
  const qMsg = await reviewCh
    .send(withModLogRolePing(cfg, { embeds, components: [row] }))
    .catch((e) => {
      client.logger.error(
        `imageReview: send to review channel ${describeChannel(reviewCh, chId)} failed (code=${e?.code || 'unknown'}): ${e?.message || e}`,
      );
      return null;
    });
  if (qMsg) {
    await client.db.updatePendingImageReviewQueueMessage(pendingId, qMsg.id);
  }
}

/**
 * Scan attachments and decide enforcement.
 *
 * Routing on a scan hit:
 *   - Staff posters → log only (existing enforceScamImage staff branch).
 *   - Low-trust users (needsQueue) → ALWAYS staff review, never auto-ban.
 *   - Trusted users + severity 'review' (pHash-only) → staff review.
 *   - Trusted users + severity 'auto' (text/link keyword) → ban via enforceScamImage.
 *
 * If every image scans clean and the user is low-trust but at least one scan failed
 * (timeout/error), queue without scan evidence so staff can sanity-check the gap.
 */
async function processImageReview(client, message, staffRoleId) {
  const attachments = listImageAttachments(message);
  if (!attachments.length) return;

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  const isStaff = hasGuildAdminOrStaffRole(member, staffRoleId);
  const needsQueue = await shouldFlagImageForReview(client, message, staffRoleId);

  if (!needsQueue && !isStaff) {
    return;
  }

  const gid = message.guild.id;
  const cfg = await client.db.getGuildConfigurable(gid);
  const chId = reviewChannelId(cfg);

  if (needsQueue && !chId) {
    client.logger.warn('imageReview: no image_review_channel_id or modLogId');
    return;
  }

  let cleanScansCompleted = 0;
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    try {
      const scan = await scanImageAttachment(client, att);
      if (scan.hit) {
        if (isStaff) {
          await enforceScamImage(client, message, staffRoleId, scan, i, att.url);
          return;
        }
        const shouldQueue = needsQueue || scan.severity === 'review';
        if (shouldQueue) {
          if (!chId) {
            client.logger.warn(
              `imageReview: scan hit (severity=${scan.severity}) but no review channel; skipping action`,
            );
            return;
          }
          await queueImageReview(client, message, attachments, member, cfg, chId, { scan, scanIndex: i });
          return;
        }
        await enforceScamImage(client, message, staffRoleId, scan, i, att.url);
        return;
      }
      cleanScansCompleted += 1;
    } catch (e) {
      client.logger.warn(`imageReview scam scan failed attachment ${i + 1}:`, e);
    }
  }

  if (!needsQueue) {
    return;
  }

  if (cleanScansCompleted === attachments.length) {
    return;
  }

  await queueImageReview(client, message, attachments, member, cfg, chId);
}

module.exports = {
  pickImageAttachment,
  listImageAttachments,
  processImageReview,
  shouldFlagImageForReview,
  reviewChannelId,
  buildImageReviewComponents,
};
