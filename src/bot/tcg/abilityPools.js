const { ABILITY_SEEDS } = require('./tcgAbilitySeeds');
const { rarityRank, sanitizeRarityAbbrev } = require('./rarityOrder');

const byTier = { 1: [], 2: [], 3: [], 4: [] };
for (const row of ABILITY_SEEDS) {
  if (byTier[row.tier]) byTier[row.tier].push(row.ability_key);
}

function rarityToAbilityTier(norm) {
  const idx = rarityRank(sanitizeRarityAbbrev(norm, 'C'));
  if (idx < 0) return 1;
  if (idx <= 2) return 1;
  if (idx <= 5) return 2;
  if (idx <= 8) return 3;
  return 4;
}

function pickRandomAbilityKeyForRarity(norm, rng = Math.random) {
  const tier = rarityToAbilityTier(norm);
  const pool = byTier[tier];
  if (!pool || !pool.length) return null;
  return pool[Math.floor(rng() * pool.length)];
}

module.exports = {
  pickRandomAbilityKeyForRarity,
  rarityToAbilityTier,
  byTier,
};
