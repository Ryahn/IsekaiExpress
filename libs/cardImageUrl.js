/**
 * Resolves the folder segment immediately under `.../cards/<folder>/file.png` from a public card URL.
 */
function getCardImageFolderName(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return 'N/A';
  try {
    if (/^https?:\/\//i.test(imageUrl)) {
      const u = new URL(imageUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      const i = parts.indexOf('cards');
      if (i >= 0 && parts[i + 1]) {
        return decodeURIComponent(parts[i + 1].replace(/\+/g, ' '));
      }
      return 'N/A';
    }
  } catch {
    /* fall through to relative */
  }
  const parts = String(imageUrl).split('/').filter(Boolean);
  const i = parts.indexOf('cards');
  if (i >= 0 && parts[i + 1]) {
    return decodeURIComponent(parts[i + 1].replace(/\+/g, ' '));
  }
  return 'N/A';
}

module.exports = { getCardImageFolderName };
