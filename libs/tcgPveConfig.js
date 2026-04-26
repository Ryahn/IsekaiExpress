/**
 * PvE constants from [CardSystem.md] (regions, tier lengths, gold bands).
 */

const { RARITY_ORDER } = require('../src/bot/tcg/rarityOrder');

/**
 * Battle-boss card pool weights by PvE tier band (replaces legacy 6-rarity `EP` bucket by splitting
 * across U / SR / SSR / SUR / UR). Sums to 100 per band; `N` is 0 (boss pool starts at C+).
 * @type {Record<string, Record<string, number>>}
 */
const BATTLE_BOSS_DROP_WEIGHT_BANDS = {
  low: {
    N: 0,
    C: 60,
    UC: 28,
    R: 9,
    U: 0.5,
    SR: 0.5,
    SSR: 0.5,
    SUR: 0.5,
    UR: 0.5,
    L: 0.4,
    M: 0.1,
  },
  mid: {
    N: 0,
    C: 35,
    UC: 32,
    R: 22,
    U: 1.8,
    SR: 1.8,
    SSR: 1.8,
    SUR: 1.8,
    UR: 1.8,
    L: 1.8,
    M: 0.2,
  },
  high: {
    N: 0,
    C: 12,
    UC: 22,
    R: 28,
    U: 5,
    SR: 5,
    SSR: 5,
    SUR: 5,
    UR: 5,
    L: 10,
    M: 3,
  },
};

/**
 * @param {number} tier 1–10
 * @returns {Array<{ abbreviation: string, weight: number }>}
 */
function battleBossRarityRowsForTier(tier) {
  const t = Math.min(10, Math.max(1, Number(tier) || 1));
  const bandKey = t <= 3 ? 'low' : t <= 6 ? 'mid' : 'high';
  const band = BATTLE_BOSS_DROP_WEIGHT_BANDS[bandKey];
  return RARITY_ORDER.map((abbrev) => ({
    abbreviation: abbrev,
    weight: band[abbrev] || 0,
  })).filter((r) => r.weight > 0);
}

const REGION_NAMES = {
  1: 'Upload Nexus',
  2: 'Moderation Citadel',
  3: 'Dev Sanctum',
  4: 'Void Archive',
  5: 'Astral Expanse',
  6: 'Fractured Meridian',
};

/** Tier I = index 0 … Tier X = index 9 — battles required to clear that tier. */
const BATTLES_PER_TIER = Object.freeze([5, 7, 9, 11, 13, 15, 15, 15, 15, 15]);

const TIER_ROMAN = Object.freeze(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);

function tierBoundsForRegion(region) {
  const r = Number(region);
  if (r >= 1 && r <= 4) return { min: 1, max: 10 };
  if (r >= 5 && r <= 6) return { min: 6, max: 10 };
  return { min: 1, max: 10 };
}

function battlesRequiredForTier(tier) {
  const t = Math.min(10, Math.max(1, Number(tier) || 1));
  return BATTLES_PER_TIER[t - 1];
}

/** Base gold on PvE win (before region 1 bonus). */
function baseGoldForTier(tier) {
  const t = Math.min(10, Math.max(1, Number(tier) || 1));
  if (t <= 3) return 10;
  if (t <= 6) return 20;
  if (t <= 9) return 35;
  return 50;
}

/** One-time bonus when clearing a tier (win that hits required wins). Scales 50g–300g per [CardSystem.md]. */
function tierClearBonusForTier(tier) {
  const t = Math.min(10, Math.max(1, Number(tier) || 1));
  if (t <= 3) return 50;
  if (t <= 6) return 100;
  if (t <= 9) return 200;
  return 300;
}

/**
 * Allowed enemy elements by region + tier (approximates Common/Rare/Primary columns).
 * @param {number} region 1–6
 * @param {number} tier 1–10
 * @returns {string[]}
 */
function elementPoolForEncounter(region, tier) {
  const r = Number(region);
  const t = Number(tier);
  const physical = ['fire', 'water', 'nature', 'earth', 'wind'];
  const meta = ['electric', 'dark', 'light', 'cosmic', 'time'];

  if (r === 1) {
    return [...physical, 'electric', 'light'];
  }
  if (r === 2) {
    const pool = [...physical, 'electric', 'light'];
    if (t >= 7) pool.push('dark');
    return pool;
  }
  if (r === 3) {
    const pool = [...physical, 'electric', 'light'];
    if (t >= 7) pool.push('time');
    pool.push('dark');
    return pool;
  }
  if (r === 4) {
    return [...physical, ...meta];
  }
  if (r === 5) {
    const pool = [...physical, 'electric', 'light', 'dark', 'time'];
    if (t >= 6) pool.push('cosmic');
    return [...new Set(pool)];
  }
  return [...physical, ...meta];
}

/**
 * PvE region ids (1–6) where this element can appear in `elementPoolForEncounter` for at least one tier.
 * Used to assign `card_data.tcg_region` (Home Turf) when batch mode is `random` — a valid home for that element.
 * @param {string} elementKey - canonical id (e.g. fire, cosmic)
 * @returns {number[]} sorted unique region numbers
 */
function regionsWhereElementCanAppear(elementKey) {
  const e = String(elementKey || '').toLowerCase().trim();
  if (!e) return [];
  const out = [];
  for (let r = 1; r <= 6; r += 1) {
    for (let t = 1; t <= 10; t += 1) {
      if (elementPoolForEncounter(r, t).includes(e)) {
        out.push(r);
        break;
      }
    }
  }
  return out;
}

/**
 * @param {string} elementKey
 * @returns {number|null} random valid Home Turf region, or null if none
 */
function pickRandomHomeRegionForElement(elementKey) {
  const regions = regionsWhereElementCanAppear(elementKey);
  if (regions.length === 0) return null;
  return regions[Math.floor(Math.random() * regions.length)];
}

function enemyDifficultyMultiplier(region, tier) {
  const reg = Math.min(6, Math.max(1, Number(region) || 1));
  const ti = Math.min(10, Math.max(1, Number(tier) || 1));
  return 1 + (ti - 1) * 0.06 + (reg - 1) * 0.04;
}

/** Final battle of each tier — enemy stat multiplier per [CardSystem.md] boss table. */
function battleBossStatMultiplierForTier(tier) {
  const t = Math.min(10, Math.max(1, Number(tier) || 1));
  if (t <= 3) return 1.5;
  if (t <= 6) return 2.0;
  if (t <= 9) return 2.75;
  return 4.0;
}

/** Extra gold for winning the battle-boss fight; scales 25g–150g per [CardSystem.md]. */
function battleBossWinGoldForTier(tier) {
  const t = Math.min(10, Math.max(1, Number(tier) || 1));
  return Math.round(25 + ((t - 1) * 125) / 9);
}

module.exports = {
  REGION_NAMES,
  BATTLES_PER_TIER,
  TIER_ROMAN,
  tierBoundsForRegion,
  battlesRequiredForTier,
  baseGoldForTier,
  tierClearBonusForTier,
  battleBossStatMultiplierForTier,
  battleBossWinGoldForTier,
  BATTLE_BOSS_DROP_WEIGHT_BANDS,
  battleBossRarityRowsForTier,
  elementPoolForEncounter,
  regionsWhereElementCanAppear,
  pickRandomHomeRegionForElement,
  enemyDifficultyMultiplier,
};
