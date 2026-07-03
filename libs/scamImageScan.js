const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const sharp = require('sharp');
const imghash = require('imghash');
const { createWorker } = require('tesseract.js');
const { hasGuildAdminOrStaffRole, hasGuildAdminOrModRole } = require('../src/bot/utils/guildPrivileges');
const { extractHttpUrls, getBlacklistedLinkHostsList, hostMatchesBlacklistedDomain } = require('./scamLinkPolicy');
const { normalizeBlacklistedLinkHost } = require('./blacklistedLinkHostNormalize');
const { withModLogRolePing } = require('./modLogNotify');
const { recordModerationAction } = require('./moderationActionLog');
const {
  normalizeScamScanText,
  testScamScanRulesAgainstTextRows,
} = require('./scamScanRulesText');
const { defaultScamScanSettings } = require('./scamScanSettings');

const DEFAULT_SCAM_SCAN_SETTINGS = defaultScamScanSettings();
const SCAN_TOTAL_TIMEOUT_MS = DEFAULT_SCAM_SCAN_SETTINGS.scam_scan_total_timeout_ms;
const DOWNLOAD_TIMEOUT_MS = DEFAULT_SCAM_SCAN_SETTINGS.scam_scan_download_timeout_ms;
const OCR_TIMEOUT_MS = DEFAULT_SCAM_SCAN_SETTINGS.scam_scan_ocr_timeout_ms;
const PHASH_TIMEOUT_MS = DEFAULT_SCAM_SCAN_SETTINGS.scam_scan_phash_timeout_ms;
const MAX_IMAGE_BYTES = DEFAULT_SCAM_SCAN_SETTINGS.scam_scan_max_image_bytes;
const MAX_IMAGE_PIXELS = DEFAULT_SCAM_SCAN_SETTINGS.scam_scan_max_image_pixels;
const MAX_SCAN_CONCURRENCY = DEFAULT_SCAM_SCAN_SETTINGS.scam_scan_max_scan_concurrency;
const MAX_OCR_CONCURRENCY = DEFAULT_SCAM_SCAN_SETTINGS.scam_scan_max_ocr_concurrency;

/** Below this, OCR text / hostname extraction is ignored (still run pHash). Reduces false bans on photos/noise. */
const OCR_MIN_CONFIDENCE_FOR_TEXT = 60;
/** blockhash bit length passed to imghash. 16 = 256-bit hash, far less collision-prone than 8 (64-bit). */
const PHASH_BITS = 16;
/** Hamming distance (bits) - calibrated for 256-bit hash; ~5% bit diff. */
const PHASH_MAX_HAMMING = 14;
const LIST_CACHE_MS = 60 * 1000;

const DEFAULT_TIMINGS = Object.freeze({
  downloadMs: null,
  preprocessMs: null,
  ocrMs: null,
  rulesMs: null,
  phashMs: null,
  totalMs: null,
});

const DEFAULT_IMAGE = Object.freeze({
  bytes: null,
  width: null,
  height: null,
  format: null,
});

class ScanStageTimeoutError extends Error {
  constructor(stage, reasonCode) {
    super(reasonCode);
    this.name = 'ScanStageTimeoutError';
    this.stage = stage;
    this.reasonCode = reasonCode;
  }
}

class ScanStageError extends Error {
  constructor(stage, reasonCode, message) {
    super(message || reasonCode);
    this.name = 'ScanStageError';
    this.stage = stage;
    this.reasonCode = reasonCode;
  }
}

class OversizeImageError extends Error {
  constructor(size) {
    super(`image exceeds ${MAX_IMAGE_BYTES} byte download cap (size=${size || 'unknown'})`);
    this.name = 'OversizeImageError';
    this.code = 'OVERSIZE_IMAGE';
  }
}

function createLimiter(maxConcurrency) {
  const queue = [];
  let active = 0;
  let max = maxConcurrency;

  function drain() {
    while (active < max && queue.length > 0) {
      const next = queue.shift();
      active += 1;
      Promise.resolve()
        .then(next.fn)
        .then(next.resolve, next.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  }

  function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      drain();
    });
  }

  limit.setMaxConcurrency = (nextMax) => {
    const n = Number(nextMax);
    if (Number.isInteger(n) && n > 0) {
      max = n;
      drain();
    }
  };

  return limit;
}

const limitScan = createLimiter(MAX_SCAN_CONCURRENCY);
const limitOcr = createLimiter(MAX_OCR_CONCURRENCY);

let textListCache = { t: 0, rows: [] };
let hashListCache = { t: 0, rows: [] };
let ocrWorkerPromise = null;
let ocrResetPromise = null;
let createOcrWorker = () => createWorker('eng');
let testTimeoutOverrides = null;
let testSettingsOverrides = null;

function getTimeouts(settings = DEFAULT_SCAM_SCAN_SETTINGS) {
  return {
    totalMs: testTimeoutOverrides?.totalMs ?? settings.scam_scan_total_timeout_ms,
    downloadMs: testTimeoutOverrides?.downloadMs ?? settings.scam_scan_download_timeout_ms,
    ocrMs: testTimeoutOverrides?.ocrMs ?? settings.scam_scan_ocr_timeout_ms,
    phashMs: testTimeoutOverrides?.phashMs ?? settings.scam_scan_phash_timeout_ms,
  };
}

async function getEffectiveScamScanSettings(client) {
  const defaults = { ...DEFAULT_SCAM_SCAN_SETTINGS, ...testSettingsOverrides };
  if (typeof client?.db?.getScamScanSettings !== 'function') {
    return defaults;
  }
  try {
    const loaded = await client.db.getScamScanSettings();
    return { ...defaults, ...loaded, ...testSettingsOverrides };
  } catch (e) {
    client?.logger?.warn?.('scamImageScan settings load failed; using safe defaults:', e);
    return defaults;
  }
}

function applyLimiterSettings(settings) {
  limitScan.setMaxConcurrency(settings.scam_scan_max_scan_concurrency);
  limitOcr.setMaxConcurrency(settings.scam_scan_max_ocr_concurrency);
}

function bustScamBlacklistCache() {
  textListCache = { t: 0, rows: [] };
  hashListCache = { t: 0, rows: [] };
}

async function getOcrWorker() {
  if (ocrResetPromise) {
    await ocrResetPromise;
  }
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createOcrWorker();
  }
  return ocrWorkerPromise;
}

async function resetOcrWorker(client, reason) {
  const current = ocrWorkerPromise;
  ocrWorkerPromise = null;
  if (!current) {
    if (ocrResetPromise) await ocrResetPromise;
    return;
  }
  const reset = (async () => {
    try {
      const worker = await current;
      await worker.terminate?.();
    } catch (e) {
      client?.logger?.warn?.(`scamImageScan OCR worker reset failed (${reason || 'unknown'}):`, e);
    }
  })();
  ocrResetPromise = reset;
  try {
    await reset;
  } finally {
    if (ocrResetPromise === reset) {
      ocrResetPromise = null;
    }
  }
}

async function warmOcrWorker(client) {
  try {
    await getOcrWorker();
    client?.logger?.info?.('scamImageScan OCR worker warmed');
  } catch (e) {
    ocrWorkerPromise = null;
    client?.logger?.warn?.('scamImageScan OCR worker warmup failed:', e);
  }
}

function normalizeOcrText(text) {
  return normalizeScamScanText(text);
}

/**
 * Tesseract often emits "words" from fur, knit patterns, etc. Treat as unreliable for text blacklist.
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

function makeEmptyScanResult() {
  return {
    status: 'failed',
    hit: false,
    reasonCode: null,
    failureStage: null,
    matchedRules: [],
    matchedHashes: [],
    timings: { ...DEFAULT_TIMINGS },
    image: { ...DEFAULT_IMAGE },
    ocrPreview: null,
    reason: null,
    detail: '',
    severity: undefined,
    ocrSnippet: null,
    ocrConfidence: 0,
  };
}

function finalizeResult(result, status, patch = {}) {
  const out = Object.assign(result, patch, { status });
  out.hit = status === 'hit';
  if (out.ocrPreview && !out.ocrSnippet) out.ocrSnippet = out.ocrPreview;
  return out;
}

function timeoutResult(result, stage, reasonCode) {
  return finalizeResult(result, 'timeout', {
    reasonCode,
    failureStage: stage,
    reason: reasonCode,
    detail: reasonCode,
  });
}

function failedResult(result, stage, reasonCode, message) {
  return finalizeResult(result, 'failed', {
    reasonCode,
    failureStage: stage,
    reason: reasonCode,
    detail: message || reasonCode,
  });
}

function skippedResult(result, stage, reasonCode, message) {
  return finalizeResult(result, 'skipped', {
    reasonCode,
    failureStage: stage,
    reason: reasonCode,
    detail: message || reasonCode,
  });
}

async function timeStage(result, stageKey, fn) {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    result.timings[stageKey] = Date.now() - started;
  }
}

function withTimeout(promise, ms, stage, reasonCode) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new ScanStageTimeoutError(stage, reasonCode)), ms);
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

function matchTextBlacklist(normalized, rows) {
  const match = testScamScanRulesAgainstTextRows(normalized, rows).matches[0];
  if (!match) return { hit: false };
  return {
    hit: true,
    detail: `text:${match.type}:${match.pattern}`,
    severity: match.severity || 'review',
    rule: { id: match.id, type: match.type, pattern: match.pattern, severity: match.severity || 'review' },
  };
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
  const rows =
    typeof client.db.getEnabledScamScanRules === 'function'
      ? await client.db.getEnabledScamScanRules()
      : await client.db.getImageTextBlacklistRows();
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
      return {
        hit: true,
        detail: `link_domain:${matched}`,
        rule: { id: null, type: 'link_domain', pattern: matched },
      };
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
    h = await computePreparedScamImagePhash(imageBuffer);
  } catch (e) {
    client.logger.warn('scamImageScan imghash failed', e);
    throw new ScanStageError('phash', 'phash_failed', e?.message || 'pHash failed');
  }
  for (const row of rows) {
    const ref = String(row.phash || '').toLowerCase();
    if (!ref) continue;
    const dist = hammingHexBits(h.toLowerCase(), ref);
    if (dist <= PHASH_MAX_HAMMING) {
      return {
        hit: true,
        detail: `phash:dist${dist}:ref#${row.id}`,
        phash: h,
        hash: { id: row.id, phash: h, reference: ref, distance: dist, description: row.description || null },
      };
    }
  }
  return { hit: false, phash: h };
}

async function prepareImageForScamScanHash(inputBuffer) {
  const { buffer } = await preprocessForScan(inputBuffer);
  return buffer;
}

async function computePreparedScamImagePhash(preprocessedBuffer) {
  return imghash.hash(preprocessedBuffer, PHASH_BITS);
}

async function computeScamImagePhash(inputBuffer) {
  const prepared = await prepareImageForScamScanHash(inputBuffer);
  return computePreparedScamImagePhash(prepared);
}

function classifyDownloadError(e) {
  if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || e?.code === 'ECONNABORTED') {
    return new ScanStageTimeoutError('download', 'download_timeout');
  }
  if (e?.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' || /maxContentLength|too large/i.test(e?.message || '')) {
    return new ScanStageError('download', 'image_too_large', e.message);
  }
  return new ScanStageError('download', 'download_failed', e?.message || 'download failed');
}

async function downloadImageBuffer(url, settings) {
  const controller = new AbortController();
  const timeoutMs = getTimeouts(settings).downloadMs;
  const maxBytes = settings.scam_scan_max_image_bytes;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const opts = {
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    signal: controller.signal,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    validateStatus: (s) => s >= 200 && s < 400,
  };

  try {
    const res = await axios.get(url, opts);
    const expected = Number(res.headers?.['content-length']);
    if (expected > maxBytes) {
      throw new ScanStageError('download', 'image_too_large', `image exceeds byte cap (${expected})`);
    }
    const buf = Buffer.from(res.data);
    if (buf.length > maxBytes) {
      throw new ScanStageError('download', 'image_too_large', `image exceeds byte cap (${buf.length})`);
    }
    if (expected > 0 && buf.length < expected) {
      throw new ScanStageError('download', 'download_failed', `truncated download (${buf.length}/${expected} bytes)`);
    }
    return buf;
  } catch (e) {
    if (e instanceof ScanStageError || e instanceof ScanStageTimeoutError) throw e;
    throw classifyDownloadError(e);
  } finally {
    clearTimeout(timeout);
  }
}

function validateImageMetadata(meta, settings = DEFAULT_SCAM_SCAN_SETTINGS) {
  const width = typeof meta?.width === 'number' ? meta.width : null;
  const height = typeof meta?.height === 'number' ? meta.height : null;
  if (!width || !height) {
    throw new ScanStageError('preprocess', 'image_dimensions_unavailable', 'image dimensions unavailable');
  }
  const pixels = width * height;
  if (pixels > settings.scam_scan_max_image_pixels) {
    throw new ScanStageError('preprocess', 'image_too_many_pixels', `image exceeds pixel cap (${pixels})`);
  }
  return { width, height, pixels };
}

async function sharpPngForScan(inputBuffer, meta, settings = DEFAULT_SCAM_SCAN_SETTINGS, sharpOptions = {}) {
  validateImageMetadata(meta, settings);
  const pipeline = sharp(inputBuffer, { failOn: 'none', ...sharpOptions }).rotate().greyscale();
  const maxEdge = Math.max(meta.width, meta.height);
  const ocrMaxEdge = settings.scam_scan_ocr_max_edge;
  const resized =
    maxEdge > ocrMaxEdge
      ? pipeline.resize(ocrMaxEdge, ocrMaxEdge, { fit: 'inside', withoutEnlargement: true })
      : pipeline;
  const buffer = await resized.png().toBuffer();
  return { buffer, meta };
}

/**
 * Discord sometimes serves HEIF/AVIF or truncated CDN payloads that confuse libvips on the
 * first decode pass. Inspect metadata once, enforce pixel limits, then try decode variants.
 */
async function preprocessForScan(inputBuffer, settings = DEFAULT_SCAM_SCAN_SETTINGS) {
  let meta;
  try {
    meta = await sharp(inputBuffer, { failOn: 'none' }).metadata();
    validateImageMetadata(meta, settings);
  } catch (e) {
    if (e instanceof ScanStageError) throw e;
    throw new ScanStageError('preprocess', 'image_decode_failed', e?.message || 'image metadata failed');
  }

  const attempts = [
    () => sharpPngForScan(inputBuffer, meta, settings),
    () => sharpPngForScan(inputBuffer, meta, settings, { sequentialRead: true }),
    () => sharpPngForScan(inputBuffer, meta, settings, { limitInputPixels: false }),
    () => sharpPngForScan(inputBuffer, meta, settings, { pages: 1 }),
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
    }
  }

  const head = inputBuffer.slice(0, 16);
  const looksJpeg = head[0] === 0xff && head[1] === 0xd8;
  if (looksJpeg) {
    try {
      return await sharpPngForScan(inputBuffer, meta, settings, { failOn: 'none', page: 0 });
    } catch (e) {
      lastErr = e;
    }
  }

  throw new ScanStageError('preprocess', 'image_decode_failed', lastErr?.message || 'image decode failed');
}

function buildLogPayload(result, context) {
  return {
    attachmentIndex: context?.attachmentIndex ?? null,
    messageId: context?.messageId ?? null,
    status: result.status,
    reasonCode: result.reasonCode,
    failureStage: result.failureStage,
    timings: result.timings,
    image: result.image,
  };
}

function logScanResult(client, result, context) {
  const payload = JSON.stringify(buildLogPayload(result, context));
  if (result.status === 'hit') {
    client.logger.info?.(`scamImageScan result ${payload}`);
  } else if (result.status === 'timeout' || result.status === 'failed') {
    client.logger.warn(`scamImageScan result ${payload}`);
  } else {
    client.logger.info?.(`scamImageScan result ${payload}`);
  }
}

function applyMetaToResult(result, rawBuf, meta) {
  result.image.bytes = rawBuf.length;
  result.image.width = typeof meta?.width === 'number' ? meta.width : null;
  result.image.height = typeof meta?.height === 'number' ? meta.height : null;
  result.image.format = meta?.format || null;
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} url
 * @returns {Promise<object>}
 */
async function scanImageUrl(client, url, settings = DEFAULT_SCAM_SCAN_SETTINGS) {
  const result = makeEmptyScanResult();
  const started = Date.now();
  try {
    const rawBuf = await timeStage(result, 'downloadMs', () => downloadImageBuffer(url, settings));
    result.image.bytes = rawBuf.length;

    const { buffer: pngBuf, meta } = await timeStage(result, 'preprocessMs', () => preprocessForScan(rawBuf, settings));
    applyMetaToResult(result, rawBuf, meta);

    let ocrRaw = '';
    let ocrConfidence = 0;
    const tinyImage = result.image.width != null && result.image.height != null
      && (result.image.width < 3 || result.image.height < 3);

    if (!settings.scam_scan_ocr_enabled) {
      result.timings.ocrMs = 0;
      result.timings.rulesMs = 0;
    } else if (!tinyImage) {
      try {
        const ocrData = await timeStage(result, 'ocrMs', () =>
          limitOcr(async () => {
              const worker = await getOcrWorker();
              try {
                return await withTimeout(worker.recognize(pngBuf), getTimeouts(settings).ocrMs, 'ocr', 'ocr_timeout');
              } catch (e) {
                if (e instanceof ScanStageTimeoutError) {
                  await resetOcrWorker(client, 'ocr_timeout');
                } else {
                  await resetOcrWorker(client, 'ocr_failed');
                }
                throw e;
              }
          }),
        );
        const data = ocrData?.data || {};
        ocrRaw = data.text || '';
        ocrConfidence = typeof data.confidence === 'number' ? data.confidence : 0;
      } catch (e) {
        if (e instanceof ScanStageTimeoutError) {
          return timeoutResult(result, e.stage, e.reasonCode);
        }
        return failedResult(result, 'ocr', 'ocr_failed', e?.message || 'OCR failed');
      }
    } else {
      result.timings.ocrMs = 0;
    }

    const normalized = normalizeOcrText(ocrRaw);
    const ocrSnippet = normalized.slice(0, 1200);
    result.ocrPreview = ocrSnippet || null;
    result.ocrSnippet = result.ocrPreview;
    result.ocrConfidence = ocrConfidence;

    if (settings.scam_scan_ocr_enabled) {
      let ruleHit;
      try {
        ruleHit = await timeStage(result, 'rulesMs', async () => {
          const trustOcrTokens =
            ocrConfidence >= OCR_MIN_CONFIDENCE_FOR_TEXT && !isLikelyOcrNoiseText(normalized, ocrRaw);

          if (!trustOcrTokens) return { hit: false };

          const textRows = await getCachedTextRows(client);
          const textHit = matchTextBlacklist(normalized, textRows);
          if (textHit.hit) return { ...textHit, reason: 'ocr' };

          const linkHit = await matchLinkBlacklistHosts(client, ocrRaw);
          if (linkHit.hit) return { ...linkHit, reason: 'ocr_link_host', severity: 'auto' };

          return { hit: false };
        });
      } catch (e) {
        return failedResult(result, 'rules', 'rule_loading_failed', e?.message || 'rule loading failed');
      }

      if (ruleHit.hit) {
        result.matchedRules.push(ruleHit.rule);
        return finalizeResult(result, 'hit', {
          reasonCode: ruleHit.reason,
          reason: ruleHit.reason,
          severity: ruleHit.severity,
          detail: ruleHit.detail,
        });
      }
    }

    if (!settings.scam_scan_phash_enabled) {
      result.timings.phashMs = 0;
      return finalizeResult(result, settings.scam_scan_ocr_enabled ? 'clean' : 'skipped', {
        reasonCode: settings.scam_scan_ocr_enabled ? 'none' : 'scanner_checks_disabled',
        reason: settings.scam_scan_ocr_enabled ? 'none' : 'scanner_checks_disabled',
        failureStage: settings.scam_scan_ocr_enabled ? null : 'settings',
        detail: settings.scam_scan_ocr_enabled ? '' : 'OCR and pHash scanning are disabled',
      });
    }

    let ph;
    try {
      ph = await timeStage(result, 'phashMs', () =>
        withTimeout(matchPhash(client, pngBuf), getTimeouts(settings).phashMs, 'phash', 'phash_timeout'),
      );
    } catch (e) {
      if (e instanceof ScanStageTimeoutError) {
        return timeoutResult(result, e.stage, e.reasonCode);
      }
      return failedResult(result, 'phash', 'phash_failed', e?.message || 'pHash failed');
    }

    if (ph.hit) {
      result.matchedHashes.push(ph.hash);
      return finalizeResult(result, 'hit', {
        reasonCode: 'phash',
        reason: 'phash',
        severity: 'review',
        detail: ph.detail,
        phash: ph.phash,
      });
    }

    return finalizeResult(result, 'clean', {
      reasonCode: 'none',
      reason: 'none',
      detail: '',
    });
  } catch (e) {
    if (e instanceof ScanStageTimeoutError) {
      return timeoutResult(result, e.stage, e.reasonCode);
    }
    if (e instanceof ScanStageError) {
      const status = e.reasonCode === 'image_too_large' ? 'skipped' : 'failed';
      return status === 'skipped'
        ? skippedResult(result, e.stage, e.reasonCode, e.message)
        : failedResult(result, e.stage, e.reasonCode, e.message);
    }
    return failedResult(result, 'unknown', 'scan_failed', e?.message || 'scan failed');
  } finally {
    result.timings.totalMs = Date.now() - started;
  }
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ url: string, size?: number }} attachment
 * @param {{ attachmentIndex?: number, messageId?: string }} [context]
 */
async function scanImageAttachment(client, attachment, context = {}) {
  const settings = await getEffectiveScamScanSettings(client);
  applyLimiterSettings(settings);
  if (!settings.scam_scan_enabled) {
    const result = skippedResult(makeEmptyScanResult(), 'settings', 'scanner_disabled', 'Scam image scanner is disabled');
    result.timings.totalMs = 0;
    logScanResult(client, result, context);
    return result;
  }

  const size = typeof attachment?.size === 'number' ? attachment.size : null;
  if (size != null && size > settings.scam_scan_max_image_bytes) {
    const result = skippedResult(makeEmptyScanResult(), 'validation', 'image_too_large', `image exceeds byte cap (${size})`);
    result.image.bytes = size;
    result.timings.totalMs = 0;
    logScanResult(client, result, context);
    return result;
  }

  const result = await limitScan(() =>
    withTimeout(scanImageUrl(client, attachment.url, settings), getTimeouts(settings).totalMs, 'total', 'scan_total_timeout'),
  ).catch((e) => {
    if (e instanceof ScanStageTimeoutError) {
      const timeout = timeoutResult(makeEmptyScanResult(), e.stage, e.reasonCode);
      timeout.timings.totalMs = getTimeouts(settings).totalMs;
      return timeout;
    }
    return failedResult(makeEmptyScanResult(), 'unknown', 'scan_failed', e?.message || 'scan failed');
  });
  logScanResult(client, result, context);
  return result;
}

function evidenceTitle(scanResult) {
  if (scanResult.status === 'timeout') return 'Image scam scan timed out';
  if (scanResult.status === 'failed') return 'Image scam scan failed';
  if (scanResult.status === 'skipped') return 'Image scam scan skipped';
  return 'Scam image auto-enforcement';
}

function evidenceColor(scanResult) {
  if (scanResult.status === 'hit') return 0xff0000;
  if (scanResult.status === 'timeout') return 0xffa500;
  if (scanResult.status === 'failed' || scanResult.status === 'skipped') return 0xffa500;
  return 0x808080;
}

function buildScamImageEvidenceEmbed(message, scanResult, attachmentIndex, attachmentUrl) {
  const matched = `${scanResult.reason || scanResult.reasonCode || scanResult.status} - ${scanResult.detail || ''}`.slice(0, 1000);
  const timings = scanResult.timings
    ? Object.entries(scanResult.timings)
      .map(([k, v]) => `${k}:${v == null ? '-' : v}`)
      .join(' ')
      .slice(0, 1000)
    : '-';
  const dimensions =
    scanResult.image?.width && scanResult.image?.height
      ? `${scanResult.image.width}x${scanResult.image.height}`
      : '-';

  return new EmbedBuilder()
    .setTitle(evidenceTitle(scanResult))
    .setColor(evidenceColor(scanResult))
    .addFields(
      { name: 'User', value: `${message.author.tag} (${message.author.id})` },
      { name: 'Channel', value: `<#${message.channelId}>` },
      { name: 'Attachment', value: `#${attachmentIndex + 1} ${attachmentUrl.slice(0, 200)}` },
      { name: 'Status', value: scanResult.status || '-', inline: true },
      { name: 'Reason', value: matched || '-', inline: false },
      { name: 'Failed stage', value: scanResult.failureStage || '-', inline: true },
      { name: 'Image', value: `${dimensions} ${scanResult.image?.bytes || '-'} bytes ${scanResult.image?.format || ''}`.trim(), inline: true },
      {
        name: 'OCR confidence',
        value:
          typeof scanResult.ocrConfidence === 'number'
            ? String(Math.round(scanResult.ocrConfidence))
            : '-',
        inline: true,
      },
      { name: 'Timings', value: timings || '-' },
      { name: 'OCR excerpt', value: (scanResult.ocrPreview || scanResult.ocrSnippet || '-').slice(0, 900) },
      { name: 'Message content', value: (message.content || '*(none)*').slice(0, 500) },
    )
    .setTimestamp();
}

/**
 * Ban + mod log (staff: log only), mirroring invite enforceBlacklist.
 */
async function recordScamImageModerationHistory(client, message, scanResult, action, logMessageId = null) {
  if (typeof client.db.createModerationReviewHistory !== 'function') return;
  await client.db.createModerationReviewHistory({
    guildId: message.guild.id,
    eventType: 'scam_image_enforcement',
    subjectType: 'user',
    subjectId: message.author.id,
    authorId: message.author.id,
    channelId: message.channelId,
    sourceMessageId: message.id,
    queueMessageId: logMessageId,
    status: 'handled',
    action,
    handledBy: 'bot',
    handledAt: new Date(),
    summary: `Scam image ${action.replace(/_/g, ' ')}`,
    metadata: {
      scanStatus: scanResult.status || null,
      reasonCode: scanResult.reasonCode || scanResult.reason || null,
      severity: scanResult.severity || null,
      detail: scanResult.detail || null,
      matchedRuleIds: (scanResult.matchedRules || []).map((rule) => rule.id).filter((id) => id != null),
      matchedHashIds: (scanResult.matchedHashes || []).map((hash) => hash.id).filter((id) => id != null),
    },
  });
}

async function enforceScamImage(client, message, staffRoleId, modRoleId, scanResult, attachmentIndex, attachmentUrl) {
  const guild = message.guild;
  if (!guild) return;
  const cfg = await client.db.getGuildConfigurable(guild.id);
  const logChannelId = cfg?.modLogId;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  const isStaff = hasGuildAdminOrStaffRole(member, staffRoleId);
  const isMod = hasGuildAdminOrModRole(member, staffRoleId, modRoleId);

  const embed = buildScamImageEvidenceEmbed(message, scanResult, attachmentIndex, attachmentUrl);

  if (isStaff || isMod) {
    let logMessageId = null;
    if (logChannelId) {
      const ch =
        guild.channels.cache.get(logChannelId) ||
        (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        const sent = await ch.send(
          withModLogRolePing(cfg, {
            content: 'Staff/mod posted scam-pattern image - no ban applied.',
            embeds: [embed],
          }),
        ).catch(() => null);
        logMessageId = sent?.id || null;
      }
    }
    await recordScamImageModerationHistory(client, message, scanResult, 'staff_log', logMessageId);
    return;
  }

  try {
    await guild.members.ban(message.author.id, {
      deleteMessageSeconds: 3600,
      reason: `Scam image: ${scanResult.detail}`.slice(0, 500),
    });
    await recordModerationAction(client, {
      guild,
      actionType: 'ban',
      targetUserId: message.author.id,
      targetUser: message.author,
      targetMember: member,
      moderatorUserId: client.user?.id,
      channelId: message.channelId,
      message,
      reason: `Scam image: ${scanResult.detail}`.slice(0, 500),
      source: 'bot_auto',
      metadata: {
        attachmentIndex,
        attachmentUrl,
        scanStatus: scanResult.status,
        scanDetail: scanResult.detail,
      },
    });
  } catch (e) {
    client.logger.error('scamImageScan enforce ban failed', e);
    let logMessageId = null;
    if (logChannelId) {
      const ch =
        guild.channels.cache.get(logChannelId) ||
        (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        const sent = await ch
          .send(withModLogRolePing(cfg, { content: `Ban failed: ${e.message}`, embeds: [embed] }))
          .catch(() => null);
        logMessageId = sent?.id || null;
      }
    }
    await recordScamImageModerationHistory(client, message, scanResult, 'ban_failed', logMessageId);
    return;
  }

  let logMessageId = null;
  if (logChannelId) {
    const ch =
      guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
    if (ch && ch.isTextBased()) {
      const sent = await ch.send(withModLogRolePing(cfg, { embeds: [embed] })).catch(() => null);
      logMessageId = sent?.id || null;
    }
  }
  await recordScamImageModerationHistory(client, message, scanResult, 'banned', logMessageId);
}

module.exports = {
  bustScamBlacklistCache,
  warmOcrWorker,
  prepareImageForScamScanHash,
  computeScamImagePhash,
  scanImageAttachment,
  scanImageUrl,
  enforceScamImage,
  buildScamImageEvidenceEmbed,
  normalizeOcrText,
  keywordPatternMatchesNormalized,
  isLikelyOcrNoiseText,
  OversizeImageError,
  MAX_DOWNLOAD_BYTES: MAX_IMAGE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  SCAN_TOTAL_TIMEOUT_MS,
  DOWNLOAD_TIMEOUT_MS,
  OCR_TIMEOUT_MS,
  PHASH_TIMEOUT_MS,
  MAX_SCAN_CONCURRENCY,
  MAX_OCR_CONCURRENCY,
  PHASH_BITS,
  PHASH_MAX_HAMMING,
  OCR_MIN_CONFIDENCE_FOR_TEXT,
  DEFAULT_SCAM_SCAN_SETTINGS,
  _internal: {
    createLimiter,
    makeEmptyScanResult,
    validateImageMetadata,
    preprocessForScan,
    resetOcrWorker,
    setOcrWorkerForTest(worker) {
      ocrWorkerPromise = Promise.resolve(worker);
    },
    setOcrWorkerFactoryForTest(factory) {
      createOcrWorker = factory;
    },
    setTimeoutsForTest(overrides) {
      testTimeoutOverrides = overrides;
    },
    setSettingsForTest(overrides) {
      testSettingsOverrides = overrides;
    },
    clearTestState() {
      testTimeoutOverrides = null;
      testSettingsOverrides = null;
      ocrWorkerPromise = null;
      ocrResetPromise = null;
      createOcrWorker = () => createWorker('eng');
      bustScamBlacklistCache();
    },
  },
};
