/**
 * Path segments after `.../cards/` (e.g. member slug, rarity folder, filename).
 * @param {string} [imageUrl]
 * @returns {string[]|null}
 */
function getCardImagePathSegments(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  let parts;
  try {
    if (/^https?:\/\//i.test(imageUrl)) {
      const u = new URL(imageUrl);
      parts = u.pathname.split('/').filter(Boolean);
    } else {
      parts = String(imageUrl).split('/').filter(Boolean);
    }
  } catch {
    parts = String(imageUrl).split('/').filter(Boolean);
  }
  const i = parts.indexOf('cards');
  if (i < 0 || !parts[i + 1]) return null;
  return parts.slice(i + 1).map((p) => decodeURIComponent(String(p).replace(/\+/g, ' ')));
}

/**
 * First segment under `cards/` (legacy helper; for catalog art this is usually the member slug).
 */
function getCardImageFolderName(imageUrl) {
  const segs = getCardImagePathSegments(imageUrl);
  return segs && segs.length ? segs[0] : 'N/A';
}

/**
 * Full relative path under `/cards/` for embeds (e.g. `Eoin / common / fire.png`).
 */
function formatCardImagePathLabel(imageUrl) {
  const segs = getCardImagePathSegments(imageUrl);
  if (!segs || !segs.length) return 'N/A';
  return segs.join(' / ');
}

module.exports = {
  getCardImagePathSegments,
  getCardImageFolderName,
  formatCardImagePathLabel,
};
