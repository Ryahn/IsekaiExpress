/**
 * Canonical ordering for the 11 rarities (lowest power → highest).
 * @type {ReadonlyArray<string>}
 */
const RARITY_ORDER = Object.freeze([
  'N', 'C', 'UC', 'R', 'U', 'SR', 'SSR', 'SUR', 'UR', 'L', 'M',
]);

const RARITY_SET = new Set(RARITY_ORDER);

/**
 * @param {string|undefined|null} [abbrev]
 * @param {string} [fallback]
 * @returns {string}
 */
function sanitizeRarityAbbrev(abbrev, fallback = 'C') {
  const u = String(abbrev == null || abbrev === '' ? fallback : abbrev).toUpperCase();
  return RARITY_SET.has(u) ? u : String(fallback).toUpperCase();
}

/**
 * @param {string|undefined|null} abbrev
 * @returns {boolean}
 */
function isValidRarityAbbrev(abbrev) {
  return RARITY_SET.has(String(abbrev || '').toUpperCase());
}

/**
 * @param {string} abbrev
 * @returns {number} -1 if unknown
 */
function rarityRank(abbrev) {
  return RARITY_ORDER.indexOf(String(abbrev || '').toUpperCase());
}

/**
 * Pity / "better than Uncommon" style checks — compare by index in RARITY_ORDER.
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a lower than b, 0 if equal, positive if a higher
 */
function compareRarity(a, b) {
  return rarityRank(a) - rarityRank(b);
}

/**
 * @param {string} abbrev
 * @returns {boolean}
 */
function isStrictlyHigherThan(abbrev, than) {
  return rarityRank(abbrev) > rarityRank(than);
}

/**
 * @param {string} abbrev
 * @returns {string|null} next step for fuse/upgrade, or null at M
 */
function nextRarityInOrder(abbrev) {
  const u = String(abbrev || 'C').toUpperCase();
  const i = RARITY_ORDER.indexOf(u);
  if (i < 0 || i >= RARITY_ORDER.length - 1) return null;
  return RARITY_ORDER[i + 1];
}

/**
 * @param {string} abbrev
 * @returns {boolean}
 */
function isRareOrBetter(abbrev) {
  return rarityRank(abbrev) >= rarityRank('R');
}

module.exports = {
  RARITY_ORDER,
  RARITY_SET,
  isValidRarityAbbrev,
  sanitizeRarityAbbrev,
  rarityRank,
  compareRarity,
  isStrictlyHigherThan,
  nextRarityInOrder,
  isRareOrBetter,
};
