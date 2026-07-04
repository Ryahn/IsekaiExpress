const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const { EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { Routes } = require('discord-api-types/v10');
const config = require('../config');

const MANIFEST_VERSION = 1;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const CONTENT_LIMIT = 2000;
const DESCRIPTION_LIMIT = 4096;

function getArchiveRoot() {
  const configured = config.starboardArchive?.dir;
  const root = configured || path.join(process.cwd(), 'starboard-archive');
  return path.resolve(root);
}

function entryArchiveRelPath(guildId, sourceMessageId) {
  return path.join(String(guildId), String(sourceMessageId));
}

function entryArchiveAbsPath(guildId, sourceMessageId) {
  return path.join(getArchiveRoot(), entryArchiveRelPath(guildId, sourceMessageId));
}

function resolveArchiveAbsPath(archivePath) {
  if (!archivePath) return null;
  const root = getArchiveRoot();
  const abs = path.resolve(root, archivePath);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error('Invalid archive path.');
  }
  return abs;
}

function safeFilename(name, fallback, index) {
  const base = String(name || fallback || 'file')
    .replace(/[^\w.\-()+\[\]]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  const stem = base || `${fallback || 'file'}-${index}`;
  return stem.includes('.') ? stem : `${stem}.bin`;
}

function isImageAttachment(attachment) {
  const type = attachment.contentType || attachment.content_type || '';
  if (type.startsWith('image/')) return true;
  const label = attachment.name || attachment.url || '';
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(label);
}

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(String(url || ''));
}

async function downloadToFile(url, destPath, logger) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: MAX_DOWNLOAD_BYTES,
      maxBodyLength: MAX_DOWNLOAD_BYTES,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    await fs.writeFile(destPath, Buffer.from(response.data));
    return true;
  } catch (error) {
    if (logger?.warn) {
      logger.warn(`Starboard archive download failed for ${url}: ${error.message}`);
    }
    return false;
  }
}

function serializeEmbed(embed) {
  if (!embed) return null;
  const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed.data || embed;
  return {
    title: data.title || null,
    description: data.description || null,
    url: data.url || null,
    color: data.color ?? null,
    timestamp: data.timestamp || null,
    footer: data.footer || null,
    author: data.author || null,
    image: data.image || null,
    thumbnail: data.thumbnail || null,
    fields: Array.isArray(data.fields) ? data.fields : [],
  };
}

async function localizeEmbedAsset(url, dir, prefix, index, logger) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const extMatch = String(url).match(/\.(png|jpe?g|gif|webp|bmp)/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : (isImageUrl(url) ? '.png' : '.bin');
  const filename = safeFilename(`${prefix}-${index}${ext}`, `${prefix}-${index}`, index);
  const rel = path.join('embed-images', filename);
  const abs = path.join(dir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const ok = await downloadToFile(url, abs, logger);
  return ok ? rel.replace(/\\/g, '/') : null;
}

async function localizeEmbedMedia(embed, dir, embedIndex, logger) {
  const next = Object.assign({}, embed);
  for (const key of ['image', 'thumbnail']) {
    const url = embed[key]?.url;
    if (!url) continue;
    const localFile = await localizeEmbedAsset(url, dir, `${key}-${embedIndex}`, 0, logger);
    if (localFile) {
      next[key] = { localFile, originalUrl: url };
    }
  }

  if (embed.author?.icon_url || embed.author?.iconURL) {
    const url = embed.author.icon_url || embed.author.iconURL;
    const localFile = await localizeEmbedAsset(url, dir, `author-${embedIndex}`, 0, logger);
    if (localFile) {
      next.author = Object.assign({}, embed.author, { localFile, originalUrl: url });
      delete next.author.icon_url;
      delete next.author.iconURL;
    }
  }

  if (embed.footer?.icon_url || embed.footer?.iconURL) {
    const url = embed.footer.icon_url || embed.footer.iconURL;
    const localFile = await localizeEmbedAsset(url, dir, `footer-${embedIndex}`, 0, logger);
    if (localFile) {
      next.footer = Object.assign({}, embed.footer, { localFile, originalUrl: url });
      delete next.footer.icon_url;
      delete next.footer.iconURL;
    }
  }

  return next;
}

async function archiveAttachments(sourceMessage, dir, logger) {
  const saved = [];
  let index = 0;
  for (const attachment of sourceMessage.attachments.values()) {
    const filename = safeFilename(attachment.name, `attachment-${index}`, index);
    const rel = path.join('attachments', filename).replace(/\\/g, '/');
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const ok = await downloadToFile(attachment.url, abs, logger);
    if (!ok) continue;
    saved.push({
      id: String(attachment.id),
      name: attachment.name || filename,
      contentType: attachment.contentType || null,
      size: attachment.size || null,
      localFile: rel,
      originalUrl: attachment.url,
      isImage: isImageAttachment(attachment),
    });
    index += 1;
  }
  return saved;
}

async function writeManifest(dir, manifest) {
  const manifestPath = path.join(dir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

async function readManifestFromPath(archivePath) {
  const abs = resolveArchiveAbsPath(archivePath);
  if (!abs) return null;
  try {
    const raw = await fs.readFile(path.join(abs, 'manifest.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function manifestExists(archivePath) {
  const manifest = await readManifestFromPath(archivePath);
  return Boolean(manifest);
}

/**
 * Archive a source message to disk when it is first posted to the starboard.
 * @returns {Promise<string|null>} Relative archive path from archive root.
 */
async function archiveStarboardMessage(logger, sourceMessage, starCount) {
  if (!config.starboardArchive?.enabled) return null;

  const guildId = sourceMessage.guild?.id || sourceMessage.guildId;
  if (!guildId) return null;

  let fullMessage = sourceMessage;
  if (fullMessage.partial) {
    fullMessage = await fullMessage.fetch().catch(() => sourceMessage);
  }

  const relPath = entryArchiveRelPath(guildId, fullMessage.id);
  const absDir = entryArchiveAbsPath(guildId, fullMessage.id);
  await fs.mkdir(absDir, { recursive: true });

  const author = fullMessage.author;
  let authorAvatarFile = null;
  const avatarUrl = author?.displayAvatarURL?.({ extension: 'png', size: 256 });
  if (avatarUrl) {
    const rel = 'author/avatar.png';
    const abs = path.join(absDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    if (await downloadToFile(avatarUrl, abs, logger)) {
      authorAvatarFile = rel.replace(/\\/g, '/');
    }
  }

  const attachments = await archiveAttachments(fullMessage, absDir, logger);
  const embeds = [];
  for (let i = 0; i < (fullMessage.embeds || []).length && i < 9; i += 1) {
    const serialized = serializeEmbed(fullMessage.embeds[i]);
    if (serialized) {
      embeds.push(await localizeEmbedMedia(serialized, absDir, i, logger));
    }
  }

  const manifest = {
    version: MANIFEST_VERSION,
    guildId: String(guildId),
    sourceChannelId: String(fullMessage.channel.id),
    sourceMessageId: String(fullMessage.id),
    sourceMessageUrl: fullMessage.url,
    sourceCreatedAt: fullMessage.createdAt?.toISOString?.() || null,
    channelName: fullMessage.channel?.name || 'unknown',
    content: fullMessage.content || '',
    starCount: Number(starCount) || 0,
    archivedAt: new Date().toISOString(),
    author: author
      ? {
          id: String(author.id),
          username: author.username || null,
          tag: author.tag || author.username || null,
          avatarFile: authorAvatarFile,
          avatarUrl: avatarUrl || null,
        }
      : null,
    attachments,
    embeds,
  };

  await writeManifest(absDir, manifest);
  return relPath.replace(/\\/g, '/');
}

async function updateArchiveStarCount(archivePath, starCount) {
  if (!archivePath) return;
  const manifest = await readManifestFromPath(archivePath);
  if (!manifest) return;
  manifest.starCount = Number(starCount) || 0;
  manifest.updatedAt = new Date().toISOString();
  const abs = resolveArchiveAbsPath(archivePath);
  await writeManifest(abs, manifest);
}

function attachmentNameFromLocalFile(localFile) {
  return path.basename(String(localFile || 'file'));
}

function loadAttachmentBuilder(absDir, localFile) {
  const abs = path.join(absDir, localFile);
  const name = attachmentNameFromLocalFile(localFile);
  return fs.readFile(abs).then((data) => new AttachmentBuilder(data, { name }));
}

function applyLocalMediaToEmbed(embed) {
  const next = new EmbedBuilder();
  if (embed.title) next.setTitle(embed.title);
  if (embed.description) next.setDescription(embed.description);
  if (embed.url) next.setURL(embed.url);
  if (embed.color != null) next.setColor(embed.color);
  if (embed.timestamp) next.setTimestamp(embed.timestamp);
  if (Array.isArray(embed.fields) && embed.fields.length) {
    next.addFields(embed.fields.map((field) => ({
      name: field.name,
      value: field.value,
      inline: Boolean(field.inline),
    })));
  }

  if (embed.image?.localFile) {
    next.setImage(`attachment://${attachmentNameFromLocalFile(embed.image.localFile)}`);
  } else if (embed.image?.url) {
    next.setImage(embed.image.url);
  }

  if (embed.thumbnail?.localFile) {
    next.setThumbnail(`attachment://${attachmentNameFromLocalFile(embed.thumbnail.localFile)}`);
  } else if (embed.thumbnail?.url) {
    next.setThumbnail(embed.thumbnail.url);
  }

  if (embed.author) {
    next.setAuthor({
      name: embed.author.name || 'Unknown',
      url: embed.author.url || undefined,
      iconURL: embed.author.localFile
        ? `attachment://${attachmentNameFromLocalFile(embed.author.localFile)}`
        : embed.author.icon_url || embed.author.iconURL || undefined,
    });
  }

  if (embed.footer?.text) {
    next.setFooter({
      text: embed.footer.text,
      iconURL: embed.footer.localFile
        ? `attachment://${attachmentNameFromLocalFile(embed.footer.localFile)}`
        : embed.footer.icon_url || embed.footer.iconURL || undefined,
    });
  }

  return next;
}

async function buildRestorePayload(manifest) {
  const archivePath = entryArchiveRelPath(manifest.guildId, manifest.sourceMessageId);
  const absDir = resolveArchiveAbsPath(archivePath);
  if (!absDir) throw new Error('Archive directory not found.');

  const files = [];
  const fileByName = new Map();

  async function ensureFile(localFile) {
    const name = attachmentNameFromLocalFile(localFile);
    if (fileByName.has(name)) return fileByName.get(name);
    const builder = await loadAttachmentBuilder(absDir, localFile);
    files.push(builder);
    fileByName.set(name, builder);
    return builder;
  }

  const channelName = manifest.channelName || 'unknown';
  const jumpUrl =
    manifest.sourceMessageUrl ||
    `https://discord.com/channels/${manifest.guildId}/${manifest.sourceChannelId}/${manifest.sourceMessageId}`;

  const descriptionParts = [`**[Jump to message](${jumpUrl})** in <#${manifest.sourceChannelId}>`];
  if (manifest.content) {
    descriptionParts.push(String(manifest.content).slice(0, CONTENT_LIMIT));
  }

  const imageAttachments = (manifest.attachments || []).filter((a) => a.isImage);
  const otherAttachments = (manifest.attachments || []).filter((a) => !a.isImage);

  for (const attachment of manifest.attachments || []) {
    await ensureFile(attachment.localFile);
  }

  if (otherAttachments.length) {
    descriptionParts.push(
      otherAttachments
        .map((a) => {
          const name = attachmentNameFromLocalFile(a.localFile);
          return `[${a.name || name}](attachment://${name})`;
        })
        .join('\n'),
    );
  }

  const description = descriptionParts.join('\n\n').slice(0, DESCRIPTION_LIMIT) || '*No text content*';
  const headerEmbed = new EmbedBuilder()
    .setDescription(description)
    .setFooter({ text: `⭐ ${manifest.starCount} | #${channelName}` });

  if (manifest.sourceCreatedAt) {
    headerEmbed.setTimestamp(new Date(manifest.sourceCreatedAt));
  }

  if (manifest.author) {
    if (manifest.author.avatarFile) {
      await ensureFile(manifest.author.avatarFile);
      headerEmbed.setAuthor({
        name: manifest.author.tag || manifest.author.username || 'Unknown user',
        iconURL: `attachment://${attachmentNameFromLocalFile(manifest.author.avatarFile)}`,
      });
    } else {
      headerEmbed.setAuthor({
        name: manifest.author.tag || manifest.author.username || 'Unknown user',
        iconURL: manifest.author.avatarUrl || undefined,
      });
    }
  }

  if (imageAttachments.length) {
    headerEmbed.setImage(`attachment://${attachmentNameFromLocalFile(imageAttachments[0].localFile)}`);
  }

  const copiedEmbeds = [];
  for (const embed of manifest.embeds || []) {
    if (embed.image?.localFile) await ensureFile(embed.image.localFile);
    if (embed.thumbnail?.localFile) await ensureFile(embed.thumbnail.localFile);
    if (embed.author?.localFile) await ensureFile(embed.author.localFile);
    if (embed.footer?.localFile) await ensureFile(embed.footer.localFile);
    copiedEmbeds.push(applyLocalMediaToEmbed(embed));
  }

  const embeds = [headerEmbed, ...copiedEmbeds].slice(0, 10);
  const content = manifest.author?.id ? `<@${manifest.author.id}>` : null;

  return { content, embeds, files };
}

async function fetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  const channel =
    guild?.channels?.cache?.get(channelId) ||
    (guild ? await guild.channels.fetch(channelId).catch(() => null) : null);
  return channel && channel.isTextBased?.() ? channel : null;
}

async function starboardMessageExists(rest, channelId, messageId) {
  if (!channelId || !messageId) return false;
  try {
    await rest.get(Routes.channelMessage(String(channelId), String(messageId)));
    return true;
  } catch {
    return false;
  }
}

async function sendRestorePayloadViaClient(channel, payload) {
  return channel.send({
    content: payload.content || undefined,
    embeds: payload.embeds,
    files: payload.files,
  });
}

async function sendRestorePayloadViaRest(rest, channelId, payload) {
  return rest.post(Routes.channelMessages(String(channelId)), {
    body: {
      content: payload.content || undefined,
      embeds: payload.embeds.map((embed) => embed.toJSON()),
    },
    files: payload.files.map((file) => ({
      name: file.name,
      data: file.attachment,
    })),
  });
}

/**
 * Restore a starboard post from a local archive.
 * @returns {Promise<{ ok: boolean, error?: string, messageId?: string, skipped?: boolean }>}
 */
async function restoreStarboardEntry({
  db,
  logger,
  guild,
  rest,
  settings,
  entry,
  force = false,
}) {
  if (!settings?.enabled || !settings.channelId) {
    return { ok: false, error: 'Starboard is not enabled or has no channel configured.' };
  }

  let archivePath = entry?.archive_path || null;
  if (!archivePath && entry?.source_message_id && entry?.guild_id) {
    const candidate = entryArchiveRelPath(entry.guild_id, entry.source_message_id).replace(/\\/g, '/');
    if (await manifestExists(candidate)) archivePath = candidate;
  }
  if (!archivePath) {
    return { ok: false, error: 'No archive exists for this starboard entry.' };
  }

  const manifest = await readManifestFromPath(archivePath);
  if (!manifest) {
    return { ok: false, error: 'Archive manifest is missing or unreadable.' };
  }

  const channelId = String(settings.channelId);
  const exists = await starboardMessageExists(rest, channelId, entry.starboard_message_id);
  if (exists && !force) {
    return { ok: false, error: 'Starboard post still exists on Discord. Use force restore to repost anyway.', skipped: true };
  }

  let payload;
  try {
    payload = await buildRestorePayload(manifest);
  } catch (error) {
    return { ok: false, error: error.message || 'Could not build restore payload from archive.' };
  }

  let sent;
  try {
    const channel = guild ? await fetchTextChannel(guild, channelId) : null;
    if (channel) {
      const me = guild.members.me;
      const perms = channel.permissionsFor(me);
      if (
        !perms?.has(PermissionFlagsBits.ViewChannel) ||
        !perms?.has(PermissionFlagsBits.SendMessages) ||
        !perms?.has(PermissionFlagsBits.EmbedLinks) ||
        !perms?.has(PermissionFlagsBits.AttachFiles)
      ) {
        return { ok: false, error: 'Bot lacks permissions to post in the starboard channel.' };
      }
      sent = await sendRestorePayloadViaClient(channel, payload);
    } else if (rest) {
      sent = await sendRestorePayloadViaRest(rest, channelId, payload);
    } else {
      return { ok: false, error: 'No Discord client available to restore the starboard post.' };
    }
  } catch (error) {
    if (logger?.error) logger.error('Starboard restore failed:', error);
    return { ok: false, error: error.message || 'Failed to post restored starboard message.' };
  }

  const messageId = sent?.id || sent?.data?.id;
  if (!messageId) {
    return { ok: false, error: 'Restore post succeeded but no message id was returned.' };
  }

  await db.upsertStarboardEntry({
    guildId: entry.guild_id || manifest.guildId,
    sourceChannelId: entry.source_channel_id || manifest.sourceChannelId,
    sourceMessageId: entry.source_message_id || manifest.sourceMessageId,
    starboardMessageId: String(messageId),
    starCount: manifest.starCount ?? entry.star_count,
    archivePath,
  });

  return { ok: true, messageId: String(messageId) };
}

async function listRestorableEntries(db, guildId, rest, settings) {
  const entries = await db.listStarboardEntries(guildId);
  const channelId = settings?.channelId;
  const results = [];

  for (const entry of entries || []) {
    const archivePath =
      entry.archive_path ||
      entryArchiveRelPath(guildId, entry.source_message_id).replace(/\\/g, '/');
    if (!(await manifestExists(archivePath))) continue;

    const missing = !(await starboardMessageExists(rest, channelId, entry.starboard_message_id));
    results.push({ entry, archivePath, missing });
  }

  return results;
}

async function restoreMissingStarboardEntries(options) {
  const { db, guild, rest, settings, logger, force = false } = options;
  const candidates = await listRestorableEntries(db, guild?.id || settings.guildId, rest, settings);
  const toRestore = force ? candidates : candidates.filter((item) => item.missing);

  let restored = 0;
  let skipped = 0;
  const errors = [];

  for (const item of toRestore) {
    const result = await restoreStarboardEntry({
      db,
      logger,
      guild,
      rest,
      settings,
      entry: { ...item.entry, archive_path: item.archivePath },
      force,
    });
    if (result.ok) restored += 1;
    else if (result.skipped) skipped += 1;
    else errors.push(result.error || 'Unknown restore error');
  }

  return { restored, skipped, errors, total: toRestore.length };
}

/**
 * One-time backfill: archive all starboard entries that do not yet have a local backup.
 */
async function backupAllStarboardEntries({ db, guild, logger }) {
  if (!config.starboardArchive?.enabled) {
    return {
      backedUp: 0,
      skipped: 0,
      failed: 0,
      errors: ['Starboard archive is disabled (STARBOARD_ARCHIVE_ENABLED).'],
      total: 0,
    };
  }

  const entries = await db.listStarboardEntries(guild.id);
  let backedUp = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const entry of entries || []) {
    const archivePath =
      entry.archive_path ||
      entryArchiveRelPath(guild.id, entry.source_message_id).replace(/\\/g, '/');

    if (await manifestExists(archivePath)) {
      skipped += 1;
      continue;
    }

    try {
      const channel =
        guild.channels.cache.get(entry.source_channel_id) ||
        (await guild.channels.fetch(entry.source_channel_id).catch(() => null));
      if (!channel?.isTextBased?.()) {
        failed += 1;
        errors.push(`Entry ${entry.id}: source channel unavailable`);
        continue;
      }

      const sourceMessage = await channel.messages.fetch(entry.source_message_id).catch(() => null);
      if (!sourceMessage) {
        failed += 1;
        errors.push(`Entry ${entry.id}: source message ${entry.source_message_id} not found`);
        continue;
      }

      const newArchivePath = await archiveStarboardMessage(logger, sourceMessage, entry.star_count);
      if (!newArchivePath) {
        failed += 1;
        errors.push(`Entry ${entry.id}: archive write failed`);
        continue;
      }

      await db.upsertStarboardEntry({
        guildId: entry.guild_id,
        sourceChannelId: entry.source_channel_id,
        sourceMessageId: entry.source_message_id,
        starboardMessageId: entry.starboard_message_id,
        starCount: entry.star_count,
        archivePath: newArchivePath,
      });

      backedUp += 1;
    } catch (error) {
      failed += 1;
      errors.push(`Entry ${entry.id}: ${error.message || 'Unknown error'}`);
      if (logger?.error) logger.error('Starboard backup_all entry failed:', error);
    }
  }

  return {
    backedUp,
    skipped,
    failed,
    errors,
    total: (entries || []).length,
  };
}

module.exports = {
  getArchiveRoot,
  entryArchiveRelPath,
  archiveStarboardMessage,
  updateArchiveStarCount,
  readManifestFromPath,
  manifestExists,
  buildRestorePayload,
  restoreStarboardEntry,
  restoreMissingStarboardEntries,
  backupAllStarboardEntries,
  listRestorableEntries,
  starboardMessageExists,
};
