/**
 * Discord-webhook log transport.
 *
 * Mirrors warn/error/crash from the main logger to a Discord webhook in another
 * server (intended for an admin-only debug server, NOT a per-guild mod log).
 *
 * Designed to be safe even under heavy log volume:
 *   - Fire-and-forget: never blocks or throws into the calling logger
 *   - Min spacing between sends (default 1500ms) → respects Discord webhook rate limit
 *   - Dedupe window (default 30s) → repeated identical messages collapse with " (×N)"
 *   - Recursion guard → if the webhook POST itself fails, the failure is printed
 *     to stderr only and never re-routed through the logger
 *   - Secret redaction → known env-var secrets and Discord token shapes are
 *     replaced with [REDACTED] before posting (intended to mitigate accidental
 *     credential leaks if a stack trace contains config values)
 */

const axios = require('axios');

const LEVEL_RANK = { debug: 10, info: 20, warn: 30, error: 40, crash: 50 };
const LEVEL_COLOR = {
  debug: 0x808080,
  info: 0x3498db,
  warn: 0xffa500,
  error: 0xff4d4d,
  crash: 0xb00020,
};

const MAX_DESCRIPTION = 3500;
const MIN_SPACING_MS = 1500;
const DEDUPE_WINDOW_MS = 30_000;
const SECRET_KEY_REGEX = /(_TOKEN|_SECRET|_PASSWORD|_PASS|_KEY|HOOK_URL)$/i;
const DISCORD_TOKEN_REGEX = /\b(?:Bot\s+)?[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g;

let webhookUrl = '';
let minLevel = LEVEL_RANK.warn;
let username = 'f95bot logs';
let initialized = false;

const queue = [];
const recentlySent = new Map();
let timer = null;
let lastSendAt = 0;
let sending = false;
let secrets = [];

function collectSecrets() {
  const acc = new Set();
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || typeof v !== 'string') continue;
    if (v.length < 6) continue;
    if (!SECRET_KEY_REGEX.test(k)) continue;
    acc.add(v);
  }
  return [...acc].sort((a, b) => b.length - a.length);
}

function redact(text) {
  if (text == null) return '';
  let out = String(text);
  for (const s of secrets) {
    if (out.includes(s)) {
      out = out.split(s).join('[REDACTED]');
    }
  }
  out = out.replace(DISCORD_TOKEN_REGEX, '[REDACTED-TOKEN]');
  out = out.replace(/(mysql|mongodb|postgres(?:ql)?|redis|amqp|https?):\/\/[^:\/\s]+:([^@\/\s]+)@/gi, '$1://[REDACTED]@');
  return out;
}

function init({ url, level, name } = {}) {
  webhookUrl = (url || process.env.LOG_WEBHOOK_URL || '').trim();
  const lvlName = (level || process.env.LOG_WEBHOOK_LEVEL || 'warn').toLowerCase();
  minLevel = LEVEL_RANK[lvlName] || LEVEL_RANK.warn;
  username = (name || process.env.LOG_WEBHOOK_USERNAME || 'f95bot logs').slice(0, 80);
  secrets = collectSecrets();
  initialized = true;
}

function isEnabled() {
  return !!webhookUrl;
}

function shouldSend(level) {
  if (!isEnabled()) return false;
  const rank = LEVEL_RANK[level];
  if (!rank) return false;
  return rank >= minLevel;
}

function buildPayload(item) {
  const desc = redact(item.msg);
  const truncated = desc.length > MAX_DESCRIPTION ? `${desc.slice(0, MAX_DESCRIPTION)}…` : desc;
  const wrapped = '```\n' + truncated.replace(/```/g, "''" + "'") + '\n```';
  const title = item.count > 1 ? `${item.level.toUpperCase()} (×${item.count})` : item.level.toUpperCase();
  return {
    username,
    embeds: [
      {
        title,
        description: wrapped.slice(0, 4096),
        color: LEVEL_COLOR[item.level] || LEVEL_COLOR.error,
        timestamp: new Date(item.firstAt).toISOString(),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

async function postItem(item) {
  if (!webhookUrl) return;
  sending = true;
  try {
    await axios.post(webhookUrl, buildPayload(item), {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
  } catch (e) {
    // Recursion guard: never route this back through the logger.
    process.stderr.write(`[loggerWebhook] post failed: ${e?.message || e}\n`);
  } finally {
    sending = false;
    lastSendAt = Date.now();
  }
}

function pruneSent() {
  const cutoff = Date.now() - DEDUPE_WINDOW_MS * 2;
  for (const [k, t] of recentlySent) {
    if (t < cutoff) recentlySent.delete(k);
  }
}

function scheduleSend() {
  if (timer) return;
  const wait = Math.max(0, MIN_SPACING_MS - (Date.now() - lastSendAt));
  timer = setTimeout(processQueue, wait);
}

async function processQueue() {
  timer = null;
  if (!queue.length) return;
  const item = queue.shift();
  recentlySent.set(item.key, Date.now());
  pruneSent();
  await postItem(item);
  if (queue.length) scheduleSend();
}

/**
 * Enqueue a message for delivery.
 * @param {'debug'|'info'|'warn'|'error'|'crash'} level
 * @param {string} msg
 */
function enqueue(level, msg) {
  if (!initialized) init();
  if (!shouldSend(level)) return;
  if (sending) return; // hard recursion guard
  if (msg == null) return;

  const text = String(msg);
  const key = `${level}:${text}`;

  // Drop dupes that were just sent
  const lastSent = recentlySent.get(key);
  if (lastSent && Date.now() - lastSent < DEDUPE_WINDOW_MS) {
    return;
  }

  // Coalesce dupes that are still queued
  const existing = queue.find((q) => q.key === key);
  if (existing) {
    existing.count += 1;
    return;
  }

  queue.push({ key, level, msg: text, count: 1, firstAt: Date.now() });
  scheduleSend();
}

module.exports = {
  init,
  enqueue,
  isEnabled,
  // exported for tests
  _internal: { redact, collectSecrets, buildPayload },
};
