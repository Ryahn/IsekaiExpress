const F95_BASE = 'https://f95zone.to';

/** Path prefixes that may be pasted without the site origin. */
const F95_PATH_PREFIXES = ['/tickets/', '/threads/', '/members/', '/moderatorpanel/user/'];

function withLeadingSlash(s) {
  const t = String(s || '').trim();
  if (!t) return t;
  return t.startsWith('/') ? t : `/${t}`;
}

/**
 * If the value is already an absolute URL, return unchanged.
 * If it looks like an F95 path fragment (e.g. `/threads/foo.bar/`), prepend https://f95zone.to
 * Otherwise return trimmed input unchanged (caller may reject if not a valid URL).
 * @param {string} raw
 * @returns {string}
 */
function normalizeF95AttentionUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;

  const path = withLeadingSlash(s);
  const lower = path.toLowerCase();
  if (F95_PATH_PREFIXES.some((p) => lower.startsWith(p))) {
    return `${F95_BASE}${path}`;
  }
  return s;
}

/**
 * @param {string | null | undefined} s
 * @returns {boolean}
 */
function isHttpUrl(s) {
  if (!s || typeof s !== 'string') return false;
  return /^https?:\/\//i.test(s.trim());
}

/**
 * @param {string} requestType
 * @param {{ threadUrl: string | null, ticketUrl: string | null, profileUrl: string | null }} urls
 * @returns {string | null} error message for user, or null if ok
 */
function validateAttentionHttpUrls(requestType, urls) {
  const { threadUrl, ticketUrl, profileUrl } = urls;
  const hint =
    'Use a full **https://...** URL, or a path starting with `/threads/`, `/tickets/`, `/members/`, or `/moderatorpanel/user/` (we prepend **https://f95zone.to** for those paths).';

  if (requestType === 'ownership_transfer') {
    if (!isHttpUrl(threadUrl) || !isHttpUrl(ticketUrl)) return hint;
  } else if (requestType === 'remove_ownership') {
    if (!isHttpUrl(threadUrl)) return hint;
  } else if (requestType === 'alt_check') {
    if (!isHttpUrl(profileUrl)) return hint;
  }
  return null;
}

module.exports = { normalizeF95AttentionUrl, isHttpUrl, F95_BASE, validateAttentionHttpUrls };
