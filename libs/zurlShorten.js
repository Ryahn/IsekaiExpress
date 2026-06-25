const axios = require('axios');
const logger = require('./logger');

const ZURL_API = 'https://zurl.zonies.xyz/api/v1/urls';
const F95_HOST_RE = /^(?:https?:\/\/)?(?:www\.)?f95zone\.to(?:\/|$)/i;
const F95_TEXT_URL_RE = /\b(?:https?:\/\/)?(?:www\.)?f95zone\.to(?:\/[^\s<>"']*)?/gi;
const TRAILING_PUNCTUATION_RE = /[),.;:!?]+$/;

function sanitizeShortenInput(raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  if (url.startsWith('<') && url.endsWith('>')) {
    url = url.slice(1, -1).trim();
  }
  url = url.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  return url.trim();
}

function isHttpUrl(s) {
  if (!s || typeof s !== 'string') return false;
  return /^https?:\/\//i.test(s.trim());
}

/**
 * POST long URL to zurl; on failure or missing API key, returns the original string.
 * @param {string} apiKey
 * @param {string} longUrl
 * @returns {Promise<string>}
 */
async function shortenUrlWithZurl(apiKey, longUrl) {
  let url = sanitizeShortenInput(longUrl);
  if (!url) return url;
  const key = String(apiKey || '').trim();
  if (!key) return url;
  if (!isHttpUrl(url)) return url;
  try {
    url = new URL(url).href;
  } catch {
    return url;
  }

  try {
    const res = await axios.post(ZURL_API, { url }, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      timeout: 12_000,
      validateStatus: () => true,
    });

    if (res.status >= 200 && res.status < 300 && res.data && typeof res.data.short_url === 'string') {
      const short = res.data.short_url.trim();
      if (short) return short;
    }

    logger.warn(
      `zurl: shorten failed (${res.status}) for url prefix ${url.slice(0, 48)}… body=${typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 200) : String(res.data)}`,
    );
  } catch (e) {
    logger.warn(`zurl: shorten request error: ${e?.message || e}`);
  }

  return url;
}

function normalizeF95TextUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!F95_HOST_RE.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

/**
 * Replaces f95zone.to links inside free-form text with zurl links.
 * @param {import('discord.js').Client} client
 * @param {string | null | undefined} text
 * @returns {Promise<string | null>}
 */
async function shortenF95UrlsInText(client, text) {
  if (text == null) return null;
  const value = String(text);
  const matches = [...value.matchAll(F95_TEXT_URL_RE)];
  if (!matches.length) return value;

  const apiKey = client.config?.zurl?.apiKey;
  const replacements = await Promise.all(
    matches.map(async (match) => {
      const original = match[0];
      const trailing = original.match(TRAILING_PUNCTUATION_RE)?.[0] || '';
      const url = trailing ? original.slice(0, -trailing.length) : original;
      const normalized = normalizeF95TextUrl(url);
      const shortened = await shortenUrlWithZurl(apiKey, normalized);
      return { original, replacement: `${shortened}${trailing}` };
    }),
  );

  let out = value;
  for (const { original, replacement } of replacements) {
    out = out.replace(original, replacement);
  }
  return out;
}

/**
 * Shorten thread / ticket / member profile URLs for attention queue (parallel).
 * @param {import('discord.js').Client} client
 * @param {{ threadUrl: string | null, ticketUrl: string | null, profileUrl: string | null }} urls
 */
async function shortenAttentionUrls(client, urls) {
  const apiKey = client.config?.zurl?.apiKey;
  const out = {
    threadUrl: urls.threadUrl,
    ticketUrl: urls.ticketUrl,
    profileUrl: urls.profileUrl,
  };

  const [t, ti, p] = await Promise.all([
    out.threadUrl ? shortenUrlWithZurl(apiKey, out.threadUrl) : Promise.resolve(null),
    out.ticketUrl ? shortenUrlWithZurl(apiKey, out.ticketUrl) : Promise.resolve(null),
    out.profileUrl ? shortenUrlWithZurl(apiKey, out.profileUrl) : Promise.resolve(null),
  ]);

  if (t != null) out.threadUrl = t;
  if (ti != null) out.ticketUrl = ti;
  if (p != null) out.profileUrl = p;

  return out;
}

module.exports = { shortenAttentionUrls, shortenF95UrlsInText, shortenUrlWithZurl };
