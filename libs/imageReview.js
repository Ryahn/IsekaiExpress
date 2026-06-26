const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { hasGuildAdminOrStaffRole, hasGuildAdminOrModRole } = require('../src/bot/utils/guildPrivileges');
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

function isIncompleteScan(scan) {
  return scan && ['timeout', 'failed', 'skipped'].includes(scan.status);
}

async function recordScanHistory(client, message, attachment, scan, options = {}) {
  if (typeof client.db.recordScamScanHistory !== 'function') return;
  try {
    await client.db.recordScamScanHistory({
      guildId: message.guild.id,
      channelId: message.channelId,
      messageId: message.id,
      attachmentId: attachment.id || null,
      attachmentIndex: options.attachmentIndex || 0,
      attachmentUrl: attachment.url,
      userId: message.author.id,
      isStaffOrMod: Boolean(options.isStaffOrMod),
      status: scan.status,
      reasonCode: scan.reasonCode || scan.reason || null,
      failureStage: scan.failureStage || null,
      manualReviewRequired: Boolean(options.manualReviewRequired),
      manualReviewQueued: Boolean(options.manualReviewQueued),
      matchedRules: scan.matchedRules || [],
      matchedHashes: scan.matchedHashes || [],
      severity: scan.severity || null,
      image: scan.image || {},
      timings: scan.timings || {},
      ocrPreview: scan.ocrPreview || scan.ocrSnippet || null,
    });
  } catch (e) {
    client.logger.warn('imageReview: failed to record scam scan history:', e);
  }
}

function reviewEvidenceTitle(scan, attachmentIndex, totalAttachments) {
  const suffix = totalAttachments > 1 ? ` (attachment ${attachmentIndex + 1}/${totalAttachments})` : '';
  if (!scan) return `Image flagged for review${suffix}`;
  if (scan.status === 'hit') return `Scam-scan hit - staff review required${suffix}`;
  if (scan.status === 'timeout') return `Image scam scan timed out - staff review required${suffix}`;
  if (scan.status === 'failed') return `Image scam scan failed - staff review required${suffix}`;
  if (scan.status === 'skipped') return `Image scam scan skipped - staff review required${suffix}`;
  return `Image flagged for review${suffix}`;
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
    const titleScan = hasScan && i === 0 ? scan : null;
    const title =
      i === 0
        ? reviewEvidenceTitle(titleScan, scanIndex ?? 0, attachments.length)
        : `Attachment ${i + 1} / ${attachments.length}`;
    const userFieldValue = message.author.tag + ' (`' + message.author.id + '`)';
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(hasScan ? 0xff4500 : 0xffa500)
      .setImage(att.url)
      .setTimestamp();
    if (i === 0) {
      embed.addFields(
        { name: 'User', value: userFieldValue },
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
    return false;
  }
  if (!reviewCh.isTextBased()) {
    client.logger.warn(
      `imageReview: review channel ${describeChannel(reviewCh, chId)} is not text-based; cannot queue`,
    );
    return false;
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
    return true;
  }
  return false;
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
 * If at least one scan failed (timeout/decode error) and not every attachment scanned
 * clean, queue without scan evidence so staff can sanity-check the gap.
 */
async function processImageReview(client, message, staffRoleId, modRoleId) {
  const attachments = listImageAttachments(message);
  if (!attachments.length) return;

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  const isStaff = hasGuildAdminOrStaffRole(member, staffRoleId);
  const isMod = hasGuildAdminOrModRole(member, staffRoleId, modRoleId);
  const needsQueue = await shouldFlagImageForReview(client, message, staffRoleId);

  const gid = message.guild.id;
  const cfg = await client.db.getGuildConfigurable(gid);
  const chId = reviewChannelId(cfg);
  let manualReviewOnFailure = true;
  if (typeof client.db.getScamScanSettings === 'function') {
    try {
      const settings = await client.db.getScamScanSettings();
      manualReviewOnFailure = settings.scam_scan_manual_review_on_failure !== false;
    } catch (e) {
      client.logger.warn('imageReview: scam scan settings load failed; keeping manual review fallback enabled', e);
    }
  }

  if (needsQueue && !chId) {
    client.logger.warn('imageReview: no image_review_channel_id or modLogId');
    return;
  }

  let cleanScansCompleted = 0;
  let firstIncompleteScan = null;
  let firstIncompleteScanIndex = 0;
  const incompleteScans = [];
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    try {
      const scan = await scanImageAttachment(client, att, {
        attachmentIndex: i,
        messageId: message.id,
      });
      if (scan.hit) {
        if (isStaff || isMod) {
          await enforceScamImage(client, message, staffRoleId, modRoleId, scan, i, att.url);
          await recordScanHistory(client, message, att, scan, {
            attachmentIndex: i,
            isStaffOrMod: true,
            manualReviewRequired: false,
            manualReviewQueued: false,
          });
          return;
        }
        const shouldQueue = needsQueue || scan.severity === 'review';
        if (shouldQueue) {
          if (!chId) {
            client.logger.warn(
              `imageReview: scan hit (severity=${scan.severity}) but no review channel; skipping action`,
            );
            await recordScanHistory(client, message, att, scan, {
              attachmentIndex: i,
              isStaffOrMod: false,
              manualReviewRequired: true,
              manualReviewQueued: false,
            });
            return;
          }
          const queued = await queueImageReview(client, message, attachments, member, cfg, chId, { scan, scanIndex: i });
          await recordScanHistory(client, message, att, scan, {
            attachmentIndex: i,
            isStaffOrMod: false,
            manualReviewRequired: true,
            manualReviewQueued: queued,
          });
          return;
        }
        await enforceScamImage(client, message, staffRoleId, modRoleId, scan, i, att.url);
        await recordScanHistory(client, message, att, scan, {
          attachmentIndex: i,
          isStaffOrMod: false,
          manualReviewRequired: false,
          manualReviewQueued: false,
        });
        return;
      }
      if (isIncompleteScan(scan)) {
        incompleteScans.push({ scan, attachment: att, index: i });
        if (manualReviewOnFailure && !firstIncompleteScan) {
          firstIncompleteScan = scan;
          firstIncompleteScanIndex = i;
        }
        if (isStaff || isMod) {
          client.logger.warn(
            `imageReview scam scan ${scan.status} for trusted uploader attachment ${i + 1}` +
              ` (stage=${scan.failureStage || 'unknown'}, reason=${scan.reasonCode || 'unknown'})`,
          );
        } else if (!manualReviewOnFailure) {
          client.logger.warn(
            `imageReview scam scan ${scan.status} attachment ${i + 1} not queued` +
              ` because manual review fallback is disabled (reason=${scan.reasonCode || 'unknown'})`,
          );
        }
        continue;
      }
      cleanScansCompleted += 1;
      await recordScanHistory(client, message, att, scan, {
        attachmentIndex: i,
        isStaffOrMod: isStaff || isMod,
        manualReviewRequired: false,
        manualReviewQueued: false,
      });
    } catch (e) {
      if (e?.code === 'OVERSIZE_IMAGE') {
        client.logger.info(`imageReview attachment ${i + 1} skipped: ${e.message}`);
      } else {
        client.logger.warn(`imageReview scam scan failed attachment ${i + 1}:`, e);
      }
    }
  }

  if (cleanScansCompleted === attachments.length) {
    return;
  }

  if (isStaff || isMod) {
    for (const item of incompleteScans) {
      await recordScanHistory(client, message, item.attachment, item.scan, {
        attachmentIndex: item.index,
        isStaffOrMod: true,
        manualReviewRequired: false,
        manualReviewQueued: false,
      });
    }
    return;
  }

  if (!manualReviewOnFailure) {
    client.logger.warn(
      `imageReview: ${attachments.length - cleanScansCompleted} attachment scan(s) incomplete; manual review fallback disabled`,
    );
    for (const item of incompleteScans) {
      await recordScanHistory(client, message, item.attachment, item.scan, {
        attachmentIndex: item.index,
        isStaffOrMod: false,
        manualReviewRequired: false,
        manualReviewQueued: false,
      });
    }
    return;
  }

  if (!chId) {
    client.logger.warn(
      `imageReview: ${attachments.length - cleanScansCompleted} attachment scan(s) failed but no review channel`,
    );
    for (const item of incompleteScans) {
      await recordScanHistory(client, message, item.attachment, item.scan, {
        attachmentIndex: item.index,
        isStaffOrMod: false,
        manualReviewRequired: true,
        manualReviewQueued: false,
      });
    }
    return;
  }

  const queued = await queueImageReview(client, message, attachments, member, cfg, chId, firstIncompleteScan
    ? { scan: firstIncompleteScan, scanIndex: firstIncompleteScanIndex }
    : undefined);
  for (const item of incompleteScans) {
    await recordScanHistory(client, message, item.attachment, item.scan, {
      attachmentIndex: item.index,
      isStaffOrMod: false,
      manualReviewRequired: true,
      manualReviewQueued: queued,
    });
  }
}

module.exports = {
  pickImageAttachment,
  listImageAttachments,
  processImageReview,
  shouldFlagImageForReview,
  reviewChannelId,
  buildImageReviewComponents,
  recordScanHistory,
};
