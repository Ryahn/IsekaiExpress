const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const sharp = require('sharp');
const imghash = require('imghash');
const { createWorker } = require('tesseract.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');
const { extractHttpUrls, getBlacklistedLinkHostsList, hostMatchesBlacklistedDomain } = require('./scamLinkPolicy');
const { normalizeBlacklistedLinkHost } = require('./blacklistedLinkHostNormalize');
const { withModLogRolePing } = require('./modLogNotify');

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20000;
const SCAN_TIMEOUT_MS = 25000;

class OversizeImageError extends Error {
  constructor(size) {
    super(`image exceeds ${MAX_DOWNLOAD_BYTES} byte download cap (size=${size || 'unknown'})`);
    this.name = 'OversizeImageError';
    this.code = 'OVERSIZE_IMAGE';
  }
}
const OCR_MAX_EDGE = 1600;
/** Below this, OCR text / hostname extraction is ignored (still run pHash). Reduces false bans on photos/noise. */
const OCR_MIN_CONFIDENCE_FOR_TEXT = 60;
/** blockhash bit length passed to imghash. 16 = 256-bit hash, far less collision-prone than 8 (64-bit). */
const PHASH_BITS = 16;
/** Hamming distance (bits) — calibrated for 256-bit hash; ~5% bit diff. */
const PHASH_MAX_HAMMING = 14;
const LIST_CACHE_MS = 60 * 1000;

let textListCache = { t: 0, rows: [] };
let hashListCache = { t: 0, rows: [] };
let ocrWorkerPromise = null;

function bustScamBlacklistCache() {
  textListCache = { t: 0, rows: [] };
  hashListCache = { t: 0, rows: [] };
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng');
  }
  return ocrWorkerPromise;
}

function normalizeOcrText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tesseract often emits “words” from fur, knit patterns, etc. Treat as unreliable for text blacklist.
 */
function isLikelyOcrNoiseText(normalized, ocrRaw) {
  const n = String(normalized || '');
  const raw = String(ocrRaw || '');
  const rawTrim = raw.trim();
  if (rawTrim.length < 24) return false;
  const wordish = n.match(/\b[a-z]{4,}\b/g) || [];
  const longWords = n.match(/\b[a-z]{5,}\b/g) || [];
  if (wordish.length >= 4 && longWords.length >= 1) return false;
  const nonSpace = raw.replace(/\s/g, '');
  if (!nonSpace.length) return true;
  const letters = nonSpace.replace(/[^a-z]/gi, '').length;
  if (letters / nonSpace.length < 0.5) return true;
  const nonAlnum = nonSpace.replace(/[a-z0-9]/gi, '').length;
  if (nonAlnum / nonSpace.length > 0.15 && wordish.length <= 3) return true;
  if (longWords.length === 0) return true;
  return false;
}

/**
 * Phrases / multi-part patterns use substring match. Single tokens must appear as tokens, not inside random OCR runs.
 */
function keywordPatternMatchesNormalized(normalized, patternLower) {
  const p = String(patternLower || '');
  if (!p) return false;
  if (p.includes(' ')) {
    return normalized.includes(p);
  }
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(normalized);
}

function matchTextBlacklist(normalized, rows) {
  for (const row of rows) {
    const p = String(row.pattern || '').toLowerCase();
    if (!p) continue;
    if (row.pattern_type === 'regex') {
      try {
        if (new RegExp(p, 'i').test(normalized)) {
          return { hit: true, detail: `text:${row.pattern_type}:${row.pattern}` };
        }
      } catch {
        /* invalid regex in DB */
      }
    } else {
      if (keywordPatternMatchesNormalized(normalized, p)) {
        return { hit: true, detail: `text:${row.pattern_type}:${row.pattern}` };
      }
    }
  }
  return { hit: false };
}

/**
 * Hostnames from OCR: full URLs plus loose hostname-like tokens.
 */
function extractHostnamesFromOcr(ocrRaw) {
  const hosts = new Set();
  const text = String(ocrRaw || '');
  for (const u of extractHttpUrls(text)) {
    try {
      const h = new URL(u).hostname;
      if (h) hosts.add(normalizeBlacklistedLinkHost(h));
    } catch {
      /* ignore */
    }
  }
  const loose = text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\b/gi) || [];
  for (const token of loose) {
    try {
      const h = new URL(`https://${token}`).hostname;
      if (h) hosts.add(normalizeBlacklistedLinkHost(h));
    } catch {
      /* ignore */
    }
  }
  return [...hosts].filter(Boolean);
}

async function getCachedTextRows(client) {
  const now = Date.now();
  if (now - textListCache.t < LIST_CACHE_MS && textListCache.rows.length) {
    return textListCache.rows;
  }
  const rows = await client.db.getImageTextBlacklistRows();
  textListCache = { t: now, rows };
  return rows;
}

async function getCachedHashRows(client) {
  const now = Date.now();
  if (now - hashListCache.t < LIST_CACHE_MS && hashListCache.rows.length) {
    return hashListCache.rows;
  }
  const rows = await client.db.getImageHashBlacklistRows();
  hashListCache = { t: now, rows };
  return rows;
}

async function matchLinkBlacklistHosts(client, ocrRaw) {
  const hosts = extractHostnamesFromOcr(ocrRaw);
  if (!hosts.length) return { hit: false };
  const list = await getBlacklistedLinkHostsList(client.db.query);
  for (const h of hosts) {
    const matched = hostMatchesBlacklistedDomain(h, list);
    if (matched) {
      return { hit: true, detail: `link_domain:${matched}` };
    }
  }
  return { hit: false };
}

function hammingHexBits(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let v = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (v) {
      d += v & 1;
      v >>= 1;
    }
  }
  return d;
}

async function matchPhash(client, imageBuffer) {
  const rows = await getCachedHashRows(client);
  if (!rows.length) return { hit: false };
  let h;
  try {
    h = await imghash.hash(imageBuffer, PHASH_BITS);
  } catch (e) {
    client.logger.warn('scamImageScan imghash failed', e);
    return { hit: false };
  }
  for (const row of rows) {
    const ref = String(row.phash || '').toLowerCase();
    if (!ref) continue;
    const dist = hammingHexBits(h.toLowerCase(), ref);
    if (dist <= PHASH_MAX_HAMMING) {
      return { hit: true, detail: `phash:dist${dist}:ref#${row.id}`, phash: h };
    }
  }
  return { hit: false };
}

async function downloadImageBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: MAX_DOWNLOAD_BYTES,
    maxBodyLength: MAX_DOWNLOAD_BYTES,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const buf = Buffer.from(res.data);
  if (buf.length > MAX_DOWNLOAD_BYTES) {
    throw new Error('image too large');
  }
  return buf;
}

async function preprocessForScan(inputBuffer) {
  const meta = await sharp(inputBuffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('not an image');
  }
  const pipeline = sharp(inputBuffer).rotate().greyscale();
  const maxEdge = Math.max(meta.width, meta.height);
  const resized =
    maxEdge > OCR_MAX_EDGE
      ? pipeline.resize(OCR_MAX_EDGE, OCR_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      : pipeline;
  const pngBuf = await resized.png().toBuffer();
  return pngBuf;
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} url
 * @returns {Promise<{ hit: boolean, reason: string, detail: string, severity?: 'auto' | 'review', ocrSnippet?: string, phash?: string }>}
 */
async function scanImageUrl(client, url) {
  const rawBuf = await downloadImageBuffer(url);
  const pngBuf = await preprocessForScan(rawBuf);

  const worker = await getOcrWorker();
  const {
    data: { text: ocrRaw, confidence: ocrConfidenceRaw },
  } = await worker.recognize(pngBuf);
  const ocrConfidence = typeof ocrConfidenceRaw === 'number' ? ocrConfidenceRaw : 0;
  const normalized = normalizeOcrText(ocrRaw);
  const ocrSnippet = normalized.slice(0, 1200);

  const trustOcrTokens =
    ocrConfidence >= OCR_MIN_CONFIDENCE_FOR_TEXT && !isLikelyOcrNoiseText(normalized, ocrRaw);

  if (trustOcrTokens) {
    const textRows = await getCachedTextRows(client);
    const textHit = matchTextBlacklist(normalized, textRows);
    if (textHit.hit) {
      return {
        hit: true,
        reason: 'ocr',
        severity: 'auto',
        detail: textHit.detail,
        ocrSnippet,
        ocrConfidence,
      };
    }

    const linkHit = await matchLinkBlacklistHosts(client, ocrRaw);
    if (linkHit.hit) {
      return {
        hit: true,
        reason: 'ocr_link_host',
        severity: 'auto',
        detail: linkHit.detail,
        ocrSnippet,
        ocrConfidence,
      };
    }
  }

  const ph = await matchPhash(client, pngBuf);
  if (ph.hit) {
    return {
      hit: true,
      reason: 'phash',
      severity: 'review',
      detail: ph.detail,
      ocrSnippet,
      phash: ph.phash,
      ocrConfidence,
    };
  }

  return { hit: false, reason: 'none', detail: '', ocrSnippet, ocrConfidence };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('scam_scan_timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ url: string }} attachment
 */
async function scanImageAttachment(client, attachment) {
  const size = typeof attachment?.size === 'number' ? attachment.size : null;
  if (size != null && size > MAX_DOWNLOAD_BYTES) {
    throw new OversizeImageError(size);
  }
  return withTimeout(scanImageUrl(client, attachment.url), SCAN_TIMEOUT_MS);
}

function buildScamImageEvidenceEmbed(message, scanResult, attachmentIndex, attachmentUrl) {
  const matched = `${scanResult.reason} — ${scanResult.detail}`.slice(0, 1000);
  return new EmbedBuilder()
    .setTitle('Scam image auto-enforcement')
    .setColor(0xff0000)
    .addFields(
      { name: 'User', value: `${message.author.tag} (${message.author.id})` },
      { name: 'Channel', value: `<#${message.channelId}>` },
      { name: 'Attachment', value: `#${attachmentIndex + 1} ${attachmentUrl.slice(0, 200)}` },
      { name: 'Match', value: matched },
      {
        name: 'OCR confidence',
        value:
          typeof scanResult.ocrConfidence === 'number'
            ? String(Math.round(scanResult.ocrConfidence))
            : '—',
      },
      { name: 'OCR excerpt', value: (scanResult.ocrSnippet || '—').slice(0, 900) },
      { name: 'Message content', value: (message.content || '*(none)*').slice(0, 500) },
    )
    .setTimestamp();
}

/**
 * Ban + mod log (staff: log only), mirroring invite enforceBlacklist.
 */
async function enforceScamImage(client, message, staffRoleId, scanResult, attachmentIndex, attachmentUrl) {
  const guild = message.guild;
  if (!guild) return;
  const cfg = await client.db.getGuildConfigurable(guild.id);
  const logChannelId = cfg?.modLogId;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  const isStaff = hasGuildAdminOrStaffRole(member, staffRoleId);

  const embed = buildScamImageEvidenceEmbed(message, scanResult, attachmentIndex, attachmentUrl);

  if (isStaff) {
    if (logChannelId) {
      const ch =
        guild.channels.cache.get(logChannelId) ||
        (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        await ch.send(
          withModLogRolePing(cfg, {
            content: 'Staff posted scam-pattern image — no ban applied.',
            embeds: [embed],
          }),
        );
      }
    }
    return;
  }

  try {
    await guild.members.ban(message.author.id, {
      deleteMessageSeconds: 3600,
      reason: `Scam image: ${scanResult.detail}`.slice(0, 500),
    });
  } catch (e) {
    client.logger.error('scamImageScan enforce ban failed', e);
    if (logChannelId) {
      const ch =
        guild.channels.cache.get(logChannelId) ||
        (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        await ch
          .send(withModLogRolePing(cfg, { content: `Ban failed: ${e.message}`, embeds: [embed] }))
          .catch(() => {});
      }
    }
    return;
  }

  if (logChannelId) {
    const ch =
      guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
    if (ch && ch.isTextBased()) {
      await ch.send(withModLogRolePing(cfg, { embeds: [embed] })).catch(() => {});
    }
  }
}

module.exports = {
  bustScamBlacklistCache,
  scanImageAttachment,
  scanImageUrl,
  enforceScamImage,
  buildScamImageEvidenceEmbed,
  normalizeOcrText,
  keywordPatternMatchesNormalized,
  isLikelyOcrNoiseText,
  OversizeImageError,
  MAX_DOWNLOAD_BYTES,
  PHASH_BITS,
  PHASH_MAX_HAMMING,
  OCR_MIN_CONFIDENCE_FOR_TEXT,
};
