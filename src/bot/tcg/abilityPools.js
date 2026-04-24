const { ABILITY_SEEDS } = require('./tcgAbilitySeeds');

const byTier = { 1: [], 2: [], 3: [], 4: [] };
for (const row of ABILITY_SEEDS) {
  if (byTier[row.tier]) byTier[row.tier].push(row.ability_key);
}

function rarityToAbilityTier(norm) {
  const k = String(norm || 'C').toUpperCase();
  if (k === 'C' || k === 'UC') return 1;
  if (k === 'R' || k === 'EP') return 2;
  if (k === 'L' || k === 'M') return 3;
  return 1;
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
