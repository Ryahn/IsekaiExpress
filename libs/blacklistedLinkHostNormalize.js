/**
 * Canonical host string for blacklisted_link_domains (imports + URL matching).
 * Strips Discord/code fences, paths, default www, trailing dots, :port.
 */
function normalizeBlacklistedLinkHost(raw) {
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  let h = s.replace(/^`+|`+$/g, '');
  h = h.split('/')[0].split('?')[0];
  h = h.replace(/:\d+$/, '');
  if (h.startsWith('www.')) h = h.slice(4);
  return h.replace(/\.$/, '');
}

module.exports = { normalizeBlacklistedLinkHost };
