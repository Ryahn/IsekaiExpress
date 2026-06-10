/**
 * Tier Boss system — separate boss fight triggered after clearing a tier's Battle Boss.
 * Each season_key+region+tier slot has one designated member (auto-picked on first encounter,
 * or admin-set via /tcg staff set_tier_boss).
 */

const db = require('../database/db');
const tcgInventory = require('./tcgInventory');
const tcgBattle = require('./tcgBattle');
const tcgAbilityBattle = require('./tcgAbilityBattle');
const { byTier: abilityByTier, pickRandomAbilityKeyForRarity } = require('../src/bot/tcg/abilityPools');
const {
  battleBossStatMultiplierForTier,
  elementPoolForEncounter,
  REGION_NAMES,
  TIER_ROMAN,
  battleBossWinGoldForTier,
} = require('./tcgPveConfig');
const { statLevelMultiplier } = require('../src/bot/tcg/cardLayout');

/** Season key for the tier boss pool. Override with TCG_TIER_BOSS_SEASON env var. */
const TIER_BOSS_SEASON_KEY = process.env.TCG_TIER_BOSS_SEASON || 'default';

/**
 * Rarity of the tier boss card per tier band.
 * @param {number} tier 1–10
 * @returns {string} rarity abbreviation
 */
function tierBossRarityForTier(tier) {
  const t = Math.min(10, Math.max(1, Number(tier) || 1));
  if (t <= 3) return 'SR';
  if (t <= 6) return 'SSR';
  if (t <= 9) return 'UR';
  return 'M';
}

/**
 * Stat multiplier for Tier Boss — same table as Battle Boss per CardSystem.md.
 * @param {number} tier
 */
function tierBossStatMultiplier(tier) {
  return battleBossStatMultiplierForTier(tier);
}

/**
 * Gold reward for a Tier Boss win — 2× Battle Boss gold.
 * @param {number} tier
 * @param {number} region
 */
function tierBossWinGold(tier, region) {
  const base = battleBossWinGoldForTier(tier) * 2;
  return region === 1 ? Math.floor(base * 1.1) : base;
}

/**
 * Look up the pool entry for this season/region/tier. Returns null if unset.
 */
async function getTierBossPoolEntry(region, tier) {
  return db.query('tcg_tier_boss_pool')
    .where({ season_key: TIER_BOSS_SEASON_KEY, region: Number(region), tier: Number(tier) })
    .first();
}

/**
 * Admin setter — upsert a pool entry.
 */
async function setTierBossPoolEntry(region, tier, memberDiscordId, cardRarity, isAdmin = false) {
  const existing = await getTierBossPoolEntry(region, tier);
  const patch = {
    member_discord_id: String(memberDiscordId),
    card_rarity: String(cardRarity),
    set_by_admin: isAdmin,
  };
  if (existing) {
    await db.query('tcg_tier_boss_pool')
      .where({ season_key: TIER_BOSS_SEASON_KEY, region: Number(region), tier: Number(tier) })
      .update(patch);
  } else {
    await db.query('tcg_tier_boss_pool').insert({
      season_key: TIER_BOSS_SEASON_KEY,
      region: Number(region),
      tier: Number(tier),
      ...patch,
    });
  }
}

/**
 * Resolve the Tier Boss card_data template for this region/tier.
 * Uses the pool entry if set, otherwise auto-picks a random member and saves it
 * so the same boss is used by all players this season.
 * @param {number} region
 * @param {number} tier
 * @returns {Promise<object|null>} card_data row
 */
async function resolveTierBossTemplate(region, tier) {
  const rarity = tierBossRarityForTier(tier);
  const elements = elementPoolForEncounter(region, tier);

  const poolEntry = await getTierBossPoolEntry(region, tier);
  if (poolEntry) {
    // Try the designated element pool first
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const el = elements[Math.floor(Math.random() * elements.length)];
      const row = await db.query('card_data')
        .where({ discord_id: poolEntry.member_discord_id, rarity: poolEntry.card_rarity, element: el })
        .whereNotNull('base_atk')
        .orderByRaw('RAND()')
        .first();
      if (row) return row;
    }
    // Fallback: same member, any element
    const anyEl = await db.query('card_data')
      .where({ discord_id: poolEntry.member_discord_id, rarity: poolEntry.card_rarity })
      .whereNotNull('base_atk')
      .orderByRaw('RAND()')
      .first();
    if (anyEl) return anyEl;
  }

  // Auto-pick: find a random template matching rarity and element pool, then save to pool
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const el = elements[Math.floor(Math.random() * elements.length)];
    const row = await db.query('card_data')
      .where({ rarity, element: el })
      .whereNotNull('base_atk')
      .whereNotNull('discord_id')
      .orderByRaw('RAND()')
      .first();
    if (row && row.discord_id) {
      // Save so all players see the same boss this season (best-effort, ignore race condition)
      setTierBossPoolEntry(region, tier, row.discord_id, rarity, false).catch(() => {});
      return row;
    }
  }

  // Final fallback: any card
  return db.query('card_data').whereNotNull('base_atk').orderByRaw('RAND()').first();
}

/**
 * Build a bonus Tier 3 ability key for Tier X bosses (per CardSystem.md).
 * @param {string|null} existingKey - don't duplicate
 * @returns {string|null}
 */
function pickBonusTier3Ability(existingKey) {
  const pool = (abilityByTier[3] || []).filter((k) => k !== existingKey);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Run the Tier Boss fight and optionally grant the drop card.
 *
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {object} pFinal - player final stats (same as used for Battle Boss, no re-applying buffs)
 * @param {object} playerRow - joined user_cards+card_data row
 * @param {number} region
 * @param {number} tier - the tier that was JUST cleared (before advancing)
 * @param {object} synMod - synergy mod result from the Battle Boss fight
 * @returns {Promise<object>}
 */
async function runTierBossFight(client, discordUser, pFinal, playerRow, region, tier, synMod) {
  const bossTemplate = await resolveTierBossTemplate(region, tier);
  if (!bossTemplate) {
    return { ok: false, error: 'No Tier Boss template available.' };
  }

  const lv = Math.min(5, Math.max(1, Number(playerRow.level) || 1));
  const mult = statLevelMultiplier(lv);
  const bm = tierBossStatMultiplier(tier);

  const bossStats = {
    atk: Math.round(Number(bossTemplate.base_atk) * mult * bm),
    def: Math.round(Number(bossTemplate.base_def) * mult * bm),
    spd: Math.round(Number(bossTemplate.base_spd) * mult * bm),
    hp: Math.round(Number(bossTemplate.base_hp) * mult * bm),
  };

  // Build boss ability set; Tier X gets a bonus Tier 3 ability
  const bossAbilityKeys = [];
  if (bossTemplate.ability_key) {
    bossAbilityKeys.push(bossTemplate.ability_key);
  } else {
    const k = pickRandomAbilityKeyForRarity(bossTemplate.rarity);
    if (k) bossAbilityKeys.push(k);
  }
  if (tier === 10) {
    const bonus = pickBonusTier3Ability(bossAbilityKeys[0] || null);
    if (bonus) bossAbilityKeys.push(bonus);
  }

  const tierLabel = TIER_ROMAN[tier - 1] || String(tier);
  const bossLabel = bossTemplate.name
    ? `${bossTemplate.name} — Tier ${tierLabel} Boss`
    : `Tier ${tierLabel} Boss`;

  const sim = tcgBattle.simulateMainVsMain(
    pFinal,
    bossStats,
    playerRow.element,
    bossTemplate.element,
    {
      playerLabel: playerRow.name || 'You',
      enemyLabel: bossLabel,
      fracturedMeridianSpdSwap: region === 6,
      defenderWeaknessImmune: synMod ? synMod.weaknessImmune : false,
      // No nullWard / revive for Tier Boss (consumables were spent on Battle Boss)
      playerNegateFirstHit: synMod ? Boolean(synMod.playerNegateFirstHit) : false,
      enemyAbilityProcPenalty: synMod ? Number(synMod.enemyAbilityProcPenalty) || 0 : 0,
      combat: {
        player: tcgAbilityBattle.buildPlayerCombatSide({
          instanceAbilityKey: playerRow.ability_key,
          classKey: playerRow.class,
          rarityKey: playerRow.rarity,
          grantedSynergyAbilityKey: synMod ? synMod.grantedBattleAbilityKey : null,
          distinctRaritiesForMember: null,
          signatureOverrideKey: null,
          synergyProcBonus: synMod ? Number(synMod.elementAbilityProcBonus) || 0 : 0,
        }),
        enemy: {
          abilityKeys: bossAbilityKeys,
          classKey: bossTemplate.class ?? null,
          rarityKey: bossTemplate.rarity ?? 'SR',
        },
      },
    },
  );

  const won = sim.outcome === 'win';
  let goldGained = 0;
  let dropResult = null;

  if (won) {
    goldGained = tierBossWinGold(tier, region);

    // Tier Boss drop: guaranteed rarity-appropriate card on win
    const dropRarity = tierBossRarityForTier(tier);
    const elements = elementPoolForEncounter(region, tier);
    let dropTemplate = null;
    for (let i = 0; i < 8; i += 1) {
      const el = elements[Math.floor(Math.random() * elements.length)];
      const row = await db.query('card_data')
        .where({ rarity: dropRarity, element: el })
        .whereNotNull('base_atk')
        .orderByRaw('RAND()')
        .first();
      if (row) { dropTemplate = row; break; }
    }

    if (dropTemplate) {
      const g = await tcgInventory.grantCardToPlayer(client, discordUser, { cardId: dropTemplate.card_id });
      dropResult = g.ok
        ? { granted: true, template: g.template, userCardId: g.userCardId }
        : { granted: false, reason: g.error };
    }
  }

  return {
    ok: true,
    won,
    sim,
    bossLabel,
    bossTemplate,
    bossStats,
    tierBossMultiplier: bm,
    goldGained,
    dropResult,
    region,
    tier,
    tierRoman: tierLabel,
    regionName: REGION_NAMES[region] || `Region ${region}`,
  };
}

module.exports = {
  runTierBossFight,
  resolveTierBossTemplate,
  getTierBossPoolEntry,
  setTierBossPoolEntry,
  tierBossRarityForTier,
  tierBossWinGold,
  TIER_BOSS_SEASON_KEY,
};
