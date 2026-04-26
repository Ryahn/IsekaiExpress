/**
 * Run: `node scripts/tcgRarityRoll.smoke.js` from repo root.
 * No DB: exercises rollRarity + seed weights + PvE boss band tables.
 */

const { RARITY_SEED_ROWS } = require('../seeds/rarity');
const { rollRarity } = require('../libs/tcgRarityRoll');
const { applyRegionAndTier } = require('../libs/tcgRarityModifiers');
const { battleBossRarityRowsForTier } = require('../libs/tcgPveConfig');
const { RARITY_ORDER } = require('../src/bot/tcg/rarityOrder');

const seedTable = RARITY_SEED_ROWS.map((r) => ({
  abbreviation: r.abbreviation,
  weight: r.weight,
}));

const wSum = seedTable.reduce((s, r) => s + r.weight, 0);
if (wSum < 99 || wSum > 102) {
  console.error('Expected seed weight sum ≈ 100, got', wSum);
  process.exit(1);
}

const N = 80_000;
const counts = Object.fromEntries(RARITY_ORDER.map((a) => [a, 0]));
for (let i = 0; i < N; i += 1) {
  const row = rollRarity(seedTable);
  counts[row.abbreviation] += 1;
}
const mRate = counts.M / N;
if (mRate < 0.0005 || mRate > 0.0025) {
  console.error('Mythic (M) Monte Carlo rate out of expected band (~0.1% base):', mRate);
  process.exit(1);
}

// Boss tier 1: expect C to dominate
const boss1 = applyRegionAndTier(battleBossRarityRowsForTier(1), 1, 1);
const boss1Counts = Object.fromEntries(RARITY_ORDER.map((a) => [a, 0]));
for (let i = 0; i < N; i += 1) {
  const row = rollRarity(boss1);
  boss1Counts[row.abbreviation] += 1;
}
if (boss1Counts.C < boss1Counts.UC * 1.2) {
  console.error('Boss tier-1: expected C > UC in aggregate', boss1Counts);
  process.exit(1);
}

// Template path: any rolled abbrev must be a valid key for card_data
for (const a of RARITY_ORDER) {
  if (!counts[a] && a !== 'M') {
    // very low tiers may miss in 80k; only fail if zero on high-weight
    if (['N', 'C', 'UC'].includes(a)) {
      console.error('Zero rolls for', a, counts);
      process.exit(1);
    }
  }
}

console.log('tcgRarityRoll.smoke: ok (seed sum', wSum + ', M rate', mRate.toFixed(4) + ')');
