/**
 * Weighted random choice over `rarity` table rows.
 * @param {Array<Record<string, unknown> & { weight: number, abbreviation: string }>} rarityTable
 * @returns {Record<string, unknown> & { weight: number, abbreviation: string }}
 */
function rollRarity(rarityTable) {
  if (!rarityTable || !rarityTable.length) {
    throw new Error('rollRarity: empty table');
  }
  const total = rarityTable.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  if (total <= 0) {
    return rarityTable[rarityTable.length - 1];
  }
  let roll = Math.random() * total;
  for (const row of rarityTable) {
    const w = Number(row.weight) || 0;
    roll -= w;
    if (roll <= 0) {
      return row;
    }
  }
  return rarityTable[rarityTable.length - 1];
}

/**
 * @param {Array<Record<string, unknown> & { weight: number, abbreviation: string }>} rarities
 * @param {string|number} region
 * @param {Record<string, Record<string, number>>} regionModifiers — regionId → (abbrev → multiplier)
 */
function applyRegionModifier(rarities, region, regionModifiers) {
  const rKey = String(region);
  const table = regionModifiers && regionModifiers[rKey] ? regionModifiers[rKey] : null;
  return rarities.map((row) => ({
    ...row,
    weight: (Number(row.weight) || 0) * (table && table[row.abbreviation] != null ? table[row.abbreviation] : 1),
  }));
}

/**
 * @param {Array<Record<string, unknown> & { weight: number, abbreviation: string }>} rarities
 * @param {number} tier
 * @param {Record<string, Record<string, number>>} tierModifiers — tierString → (abbrev → multiplier)
 */
function applyTierModifier(rarities, tier, tierModifiers) {
  const tKey = String(tier);
  const table = tierModifiers && tierModifiers[tKey] ? tierModifiers[tKey] : null;
  return rarities.map((row) => ({
    ...row,
    weight: (Number(row.weight) || 0) * (table && table[row.abbreviation] != null ? table[row.abbreviation] : 1),
  }));
}

/**
 * @param {Array<Record<string, unknown> & { weight: number, abbreviation: string }>} a
 * @param {Array<Record<string, unknown> & { weight: number, abbreviation: string }>} b
 */
function composeTableWeights(a) {
  return a;
}

module.exports = {
  rollRarity,
  applyRegionModifier,
  applyTierModifier,
  composeTableWeights,
};
