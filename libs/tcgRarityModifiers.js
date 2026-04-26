/**
 * @typedef {Record<string, Record<string, number>>} AbbrevToMultiplier
 *
 * `region` / tier keys are stringified ids (e.g. "1" … "6", "1" … "10"). All values default 1
 * in code: multiply by `map[key]?.[abbrev] ?? 1` when not listed here.
 *
 * Rarity `abbrev` keys: N, C, UC, R, U, SR, SSR, SUR, UR, L, M
 */

const { applyRegionModifier, applyTierModifier } = require('./tcgRarityRoll');
const { RARITY_ORDER } = require('../src/bot/tcg/rarityOrder');

const identityAbbrevRow = RARITY_ORDER.reduce((acc, abbrev) => {
  acc[abbrev] = 1;
  return acc;
}, /** @type {Record<string, number>} */ ({}));

/** @type {AbbrevToMultiplier} */
const REGION_MODIFIERS = {
  1: { ...identityAbbrevRow },
  2: { ...identityAbbrevRow },
  3: { ...identityAbbrevRow },
  4: { ...identityAbbrevRow },
  5: { ...identityAbbrevRow },
  6: { ...identityAbbrevRow },
};

/** @type {AbbrevToMultiplier} */
const TIER_MODIFIERS = {
  1: { ...identityAbbrevRow },
  2: { ...identityAbbrevRow },
  3: { ...identityAbbrevRow },
  4: { ...identityAbbrevRow },
  5: { ...identityAbbrevRow },
  6: { ...identityAbbrevRow },
  7: { ...identityAbbrevRow },
  8: { ...identityAbbrevRow },
  9: { ...identityAbbrevRow },
  10: { ...identityAbbrevRow },
};

function applyRegionAndTier(
  rarities,
  region,
  tier,
) {
  let t = rarities;
  t = applyRegionModifier(t, String(region), REGION_MODIFIERS);
  t = applyTierModifier(t, String(tier), TIER_MODIFIERS);
  return t;
}

module.exports = {
  REGION_MODIFIERS,
  TIER_MODIFIERS,
  applyRegionAndTier,
};
