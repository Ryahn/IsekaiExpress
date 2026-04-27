const db = require('../database/db');
const { statLevelMultiplier } = require('../src/bot/tcg/cardLayout');
const { sanitizeRarityAbbrev } = require('../src/bot/tcg/rarityOrder');
const { rollRarity } = require('./tcgRarityRoll');
const { applyRegionAndTier } = require('./tcgRarityModifiers');
const tcgEconomy = require('./tcgEconomy');
const tcgInventory = require('./tcgInventory');
const tcgLoadout = require('./tcgLoadout');
const tcgBattle = require('./tcgBattle');
const tcgAbilityBattle = require('./tcgAbilityBattle');
const tcgCollectionSets = require('./tcgCollectionSets');
const tcgSetProgress = require('./tcgSetProgress');
const tcgSynergy = require('./tcgSynergy');
const tcgCombatBuffs = require('./tcgCombatBuffs');
const tcgLend = require('./tcgLend');
const {
  REGION_NAMES,
  TIER_ROMAN,
  tierBoundsForRegion,
  battlesRequiredForTier,
  baseGoldForTier,
  tierClearBonusForTier,
  battleBossStatMultiplierForTier,
  battleBossWinGoldForTier,
  elementPoolForEncounter,
  enemyDifficultyMultiplier,
  battleBossRarityRowsForTier,
} = require('./tcgPveConfig');

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function clampProgress(p) {
  const bounds = tierBoundsForRegion(p.current_region);
  let tier = Number(p.current_tier);
  let region = Number(p.current_region);
  if (tier < bounds.min) tier = bounds.min;
  if (tier > bounds.max) tier = bounds.max;
  if (region < 1) region = 1;
  if (region > 6) region = 6;
  if (region > Number(p.max_region_unlocked)) region = Number(p.max_region_unlocked);
  return { ...p, current_tier: tier, current_region: region };
}

async function ensureProgress(internalId) {
  let row = await db.query('tcg_pve_progress').where({ user_id: internalId }).first();
  if (row) return clampProgress(row);
  const ts = nowUnix();
  try {
    await db.query('tcg_pve_progress').insert({
      user_id: internalId,
      current_region: 1,
      current_tier: 1,
      wins_in_tier: 0,
      max_region_unlocked: 1,
      pve_win_streak: 0,
      pve_bb_pity: 0,
      updated_at: ts,
    });
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw e;
  }
  row = await db.query('tcg_pve_progress').where({ user_id: internalId }).first();
  return clampProgress(row);
}

function advanceProgressAfterWin(p) {
  const region = Number(p.current_region);
  const tier = Number(p.current_tier);
  const bounds = tierBoundsForRegion(region);
  const req = battlesRequiredForTier(tier);
  const newWins = Number(p.wins_in_tier) + 1;
  const nextStreak = Number(p.pve_win_streak) + 1;

  if (newWins < req) {
    return {
      ...p,
      wins_in_tier: newWins,
      pve_win_streak: nextStreak,
      updated_at: nowUnix(),
    };
  }

  if (tier < bounds.max) {
    return {
      ...p,
      current_tier: tier + 1,
      wins_in_tier: 0,
      pve_win_streak: nextStreak,
      updated_at: nowUnix(),
    };
  }

  if (region < 6) {
    const nextRegion = region + 1;
    const nextTier = nextRegion >= 5 ? 6 : 1;
    return {
      ...p,
      max_region_unlocked: Math.max(Number(p.max_region_unlocked), nextRegion),
      current_region: nextRegion,
      current_tier: nextTier,
      wins_in_tier: 0,
      pve_win_streak: nextStreak,
      updated_at: nowUnix(),
    };
  }

  return {
    ...p,
    wins_in_tier: 0,
    pve_win_streak: nextStreak,
    updated_at: nowUnix(),
  };
}

function applyVoidArchiveMirror(pStats, eStats) {
  const avg = (a, b) => Math.round((a + b) / 2);
  const n = {
    atk: avg(pStats.atk, eStats.atk),
    def: avg(pStats.def, eStats.def),
    spd: avg(pStats.spd, eStats.spd),
    hp: avg(pStats.hp, eStats.hp),
  };
  return { player: { ...n }, enemy: { ...n } };
}

async function pickEnemyTemplate(region, tier) {
  const pool = elementPoolForEncounter(region, tier);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const el = pool[Math.floor(Math.random() * pool.length)];
    let q = db.query('card_data')
      .whereNotNull('base_atk')
      .whereNotNull('base_def')
      .whereNotNull('base_spd')
      .whereNotNull('base_hp');
    if (el) q = q.where('element', el);
    const row = await q.orderByRaw('RAND()').first();
    if (row) return row;
  }
  return db.query('card_data')
    .whereNotNull('base_atk')
    .whereNotNull('base_def')
    .whereNotNull('base_spd')
    .whereNotNull('base_hp')
    .orderByRaw('RAND()')
    .first();
}

async function pickBattleBossDropTemplate(region, tier) {
  const elements = elementPoolForEncounter(region, tier);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const baseRows = battleBossRarityRowsForTier(tier);
    const modded = applyRegionAndTier(baseRows, region, tier);
    const rolled = rollRarity(modded);
    const rarity = rolled.abbreviation;
    const row = await db.query('card_data')
      .whereIn('element', elements)
      .whereNotNull('base_atk')
      .whereNotNull('base_def')
      .whereNotNull('base_spd')
      .whereNotNull('base_hp')
      .where({ rarity })
      .orderByRaw('RAND()')
      .first();
    if (row) return row;
  }
  return db.query('card_data')
    .whereIn('element', elements)
    .whereNotNull('base_atk')
    .whereNotNull('base_def')
    .whereNotNull('base_spd')
    .whereNotNull('base_hp')
    .orderByRaw('RAND()')
    .first();
}

async function userOwnsTemplate(internalId, cardId) {
  const row = await db.query('user_cards')
    .where({ user_id: internalId, card_id: cardId })
    .first();
  return !!row;
}

/**
 * Pool card drop after winning a battle boss ([CardSystem.md]: 40% new / 5% dupe, pity 11).
 */
async function tryBattleBossPoolDrop(client, discordUser, internalId, region, tier, pityBefore) {
  const template = await pickBattleBossDropTemplate(region, tier);
  if (!template) {
    return { granted: false, pityAfter: pityBefore + 1, reason: 'no_pool' };
  }

  const owns = await userOwnsTemplate(internalId, template.card_id);
  const hardPity = pityBefore >= 10;
  const roll = Math.random();
  const hitChance = owns ? 0.05 : 0.4;
  if (!hardPity && roll >= hitChance) {
    return { granted: false, pityAfter: pityBefore + 1, reason: 'miss' };
  }

  const g = await tcgInventory.grantCardToPlayer(client, discordUser, { cardId: template.card_id });
  if (!g.ok) {
    return { granted: false, pityAfter: pityBefore, reason: 'grant_failed', error: g.error };
  }

  return {
    granted: true,
    pityAfter: 0,
    hardPity,
    userCardId: g.userCardId,
    template: g.template,
  };
}

/**
 * Move PvE position to an unlocked region/tier (revisit / farm). Resets streak.
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {{ region: number, tier?: number | null }} opts tier defaults to first tier of that region
 */
async function travelTo(client, discordUser, opts) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  const targetRegion = Math.min(6, Math.max(1, Number(opts.region) || 1));
  let progress = await ensureProgress(internalId);
  if (targetRegion > Number(progress.max_region_unlocked)) {
    return {
      ok: false,
      error: `Region **${targetRegion}** is locked. Clear the previous region first.`,
    };
  }

  const bounds = tierBoundsForRegion(targetRegion);
  let targetTier = opts.tier != null ? Number(opts.tier) : bounds.min;
  if (!Number.isFinite(targetTier)) targetTier = bounds.min;
  targetTier = Math.min(bounds.max, Math.max(bounds.min, targetTier));

  const ts = nowUnix();
  await db.query('tcg_pve_progress').where({ user_id: internalId }).update({
    current_region: targetRegion,
    current_tier: targetTier,
    wins_in_tier: 0,
    pve_win_streak: 0,
    updated_at: ts,
  });
  progress = {
    ...progress,
    current_region: targetRegion,
    current_tier: targetTier,
    wins_in_tier: 0,
    pve_win_streak: 0,
    updated_at: ts,
  };

  return {
    ok: true,
    progress,
    regionName: REGION_NAMES[targetRegion],
    tierRoman: TIER_ROMAN[targetTier - 1],
    tierBounds: bounds,
  };
}

async function getProgressSummary(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return null;
  const p = await ensureProgress(internalId);
  const bounds = tierBoundsForRegion(p.current_region);
  const need = battlesRequiredForTier(p.current_tier);
  const roman = TIER_ROMAN[p.current_tier - 1] || String(p.current_tier);
  return {
    ...p,
    regionName: REGION_NAMES[p.current_region] || `Region ${p.current_region}`,
    tierRoman: roman,
    battlesRequired: need,
    tierBounds: bounds,
  };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function runPveFight(client, discordUser) {
  const detail = await tcgLoadout.getLoadoutDetail(client, discordUser);
  if (!detail || !detail.row.main_user_card_id) {
    return { ok: false, error: 'Set a **main** card with `/tcg equip` before PvE.' };
  }

  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  await tcgLend.expireDueLoans(db.query);

  let progress = await ensureProgress(internalId);
  const mainId = detail.row.main_user_card_id;
  const playerRow = await db.query('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .where({
      'user_cards.user_card_id': mainId,
      'user_cards.user_id': internalId,
    })
    .select(
      'user_cards.user_card_id',
      'user_cards.level',
      'user_cards.lent_source_user_card_id',
      'user_cards.ability_key',
      'card_data.name',
      'card_data.element',
      'card_data.class',
      'card_data.rarity',
      'card_data.discord_id',
      'card_data.base_atk',
      'card_data.base_def',
      'card_data.base_spd',
      'card_data.base_hp',
    )
    .first();

  if (!playerRow) {
    return { ok: false, error: 'Main card missing from inventory — update loadout.' };
  }

  let pStats = tcgInventory.combatStatsFromJoinedRow(playerRow);
  if (!pStats) {
    return { ok: false, error: 'Main card has no combat stats.' };
  }

  const region = Number(progress.current_region);
  const tier = Number(progress.current_tier);
  const fightRegion = region;
  const tierBattlesRequired = battlesRequiredForTier(tier);
  const isBattleBoss =
    tierBattlesRequired > 0 && Number(progress.wins_in_tier) === tierBattlesRequired - 1;

  const enemyTemplate = await pickEnemyTemplate(region, tier);
  if (!enemyTemplate) {
    return { ok: false, error: 'No catalog templates available for this encounter.' };
  }

  const synMod = tcgSynergy.computeCombatSynergy(
    { main: detail.main, support1: detail.support1, support2: detail.support2 },
    enemyTemplate.element,
    fightRegion,
  );
  pStats = tcgSynergy.applySynergyToStats(pStats, synMod);

  const memberDiscordId = playerRow.discord_id;
  const memberDistinct =
    memberDiscordId != null
      ? await tcgInventory.countDistinctRaritiesForMember(internalId, memberDiscordId)
      : 0;

  if (region === 3 && Number(progress.pve_win_streak) > 0) {
    const bonus = 1 + 0.05 * Number(progress.pve_win_streak);
    pStats = {
      ...pStats,
      atk: Math.round(pStats.atk * bonus),
    };
  }
  if (region === 5) {
    pStats = {
      ...pStats,
      spd: Math.round(pStats.spd * 1.05),
    };
  }

  const chargeSnap = await tcgCombatBuffs.getCombatChargeCounts(internalId);
  const combatUsed = {
    shardFocus: chargeSnap.shardFocus > 0,
    ironVeil: chargeSnap.ironVeil > 0,
    overclock: chargeSnap.overclock > 0,
    nullWard: chargeSnap.nullWard > 0,
  };
  if (combatUsed.shardFocus) pStats = tcgCombatBuffs.applyShardFocusToAtkStats(pStats);
  if (combatUsed.ironVeil) pStats = tcgCombatBuffs.applyIronVeilToDefStats(pStats);
  if (combatUsed.overclock) pStats = tcgCombatBuffs.applyOverclockToSpdStats(pStats);
  const reviveOnLoss = chargeSnap.revive > 0;

  const lv = Math.min(5, Math.max(1, Number(playerRow.level) || 1));
  // Enemy: template L1 base * same level mult as the linear card-level curve * region/tier diff.
  // (Documented in CardSystem.md; change here if you want enemy to ignore main instance level.)
  const mult = statLevelMultiplier(lv);
  const diff = enemyDifficultyMultiplier(region, tier);
  let enemyStats = {
    atk: Math.round(Number(enemyTemplate.base_atk) * mult * diff),
    def: Math.round(Number(enemyTemplate.base_def) * mult * diff),
    spd: Math.round(Number(enemyTemplate.base_spd) * mult * diff),
    hp: Math.round(Number(enemyTemplate.base_hp) * mult * diff),
  };

  if (isBattleBoss) {
    const bm = battleBossStatMultiplierForTier(tier);
    enemyStats = {
      atk: Math.round(enemyStats.atk * bm),
      def: Math.round(enemyStats.def * bm),
      spd: Math.round(enemyStats.spd * bm),
      hp: Math.round(enemyStats.hp * bm),
    };
  }

  if (region === 2) {
    enemyStats = { ...enemyStats, def: Math.round(enemyStats.def * 1.1) };
  }

  let pFinal = { ...pStats };
  let eFinal = { ...enemyStats };
  if (region === 4) {
    const mirrored = applyVoidArchiveMirror(pStats, enemyStats);
    pFinal = mirrored.player;
    eFinal = mirrored.enemy;
  }

  let mythicSignatureKey = null;
  if (
    memberDiscordId != null
    && memberDistinct >= 6
    && sanitizeRarityAbbrev(playerRow.rarity, 'C') === 'M'
  ) {
    mythicSignatureKey = await tcgSetProgress.resolveMythicSignatureKey(memberDiscordId);
  }

  const bossTag = isBattleBoss ? ' · Battle Boss' : '';
  const sim = tcgBattle.simulateMainVsMain(pFinal, eFinal, playerRow.element, enemyTemplate.element, {
    playerLabel: playerRow.name || 'You',
    enemyLabel: enemyTemplate.name ? `${enemyTemplate.name} (PvE${bossTag})` : `Enemy${bossTag}`,
    fracturedMeridianSpdSwap: region === 6,
    defenderWeaknessImmune: synMod.weaknessImmune,
    negateEnemyElementAdvantageOnce: combatUsed.nullWard,
    reviveOnLoss,
    combat: {
      player: tcgAbilityBattle.buildPlayerCombatSide({
        instanceAbilityKey: playerRow.ability_key,
        classKey: playerRow.class,
        rarityKey: playerRow.rarity,
        grantedSynergyAbilityKey: synMod.grantedBattleAbilityKey,
        distinctRaritiesForMember: memberDistinct,
        signatureOverrideKey: mythicSignatureKey,
      }),
      enemy: tcgAbilityBattle.buildEnemyCombatSide(enemyTemplate),
    },
  });

  await tcgCombatBuffs.consumeCombatChargesAfterBattle(internalId, {
    shardFocus: combatUsed.shardFocus,
    ironVeil: combatUsed.ironVeil,
    overclock: combatUsed.overclock,
    nullWard: combatUsed.nullWard,
    revive: sim.reviveUsed,
  });

  const won = sim.outcome === 'win';
  let goldGained = 0;
  const baseGoldThisTier = baseGoldForTier(tier);
  let pveWinGold = 0;
  let tierClearBonusAmount = 0;
  let battleBossGoldAmount = 0;
  let tierCleared = false;
  let battleBossDrop = null;

  if (won) {
    pveWinGold = baseGoldThisTier;
    if (region === 1) {
      pveWinGold = Math.floor(pveWinGold * 1.1);
    }
    tierCleared = Number(progress.wins_in_tier) + 1 >= tierBattlesRequired;
    if (tierCleared) {
      tierClearBonusAmount = tierClearBonusForTier(tier);
      if (region === 1) {
        tierClearBonusAmount = Math.floor(tierClearBonusAmount * 1.1);
      }
    }
    if (isBattleBoss) {
      battleBossGoldAmount = battleBossWinGoldForTier(tier);
      if (region === 1) {
        battleBossGoldAmount = Math.floor(battleBossGoldAmount * 1.1);
      }
    }
    const setGoldM = tcgCollectionSets.battleGoldMultiplier(memberDistinct);
    const commanderM =
      tcgAbilityBattle.normClassKey(detail.main?.class) === 'commander'
        ? 1 + tcgAbilityBattle.COMMANDER_BATTLE_GOLD_BONUS
        : 1;
    const totalGold = Math.floor(
      (pveWinGold + tierClearBonusAmount + battleBossGoldAmount)
        * synMod.goldMult
        * setGoldM
        * commanderM,
    );
    let payBorrower = totalGold;
    let payLender = 0;
    let lenderInternalId = null;
    if (playerRow.lent_source_user_card_id) {
      const srcRow = await db
        .query('user_cards')
        .where({ user_card_id: Number(playerRow.lent_source_user_card_id) })
        .first();
      if (srcRow) {
        lenderInternalId = Number(srcRow.user_id);
        payBorrower = Math.floor(totalGold * 0.6);
        payLender = totalGold - payBorrower;
      }
    }
    if (payBorrower > 0) {
      const g = await tcgEconomy.addGold(client, discordUser, payBorrower);
      if (!g.ok) return g;
    }
    if (payLender > 0 && lenderInternalId) {
      await tcgEconomy.incrementGoldInternal(lenderInternalId, payLender);
    }
    goldGained = totalGold;

    let bbPityAfter = Number(progress.pve_bb_pity) || 0;
    if (isBattleBoss) {
      battleBossDrop = await tryBattleBossPoolDrop(
        client,
        discordUser,
        internalId,
        fightRegion,
        tier,
        bbPityAfter,
      );
      bbPityAfter = battleBossDrop.pityAfter;
    }

    const next = advanceProgressAfterWin(progress);
    await db.query('tcg_pve_progress').where({ user_id: internalId }).update({
      current_region: next.current_region,
      current_tier: next.current_tier,
      wins_in_tier: next.wins_in_tier,
      max_region_unlocked: next.max_region_unlocked,
      pve_win_streak: next.pve_win_streak,
      pve_bb_pity: bbPityAfter,
      updated_at: next.updated_at,
    });
    progress = { ...next, pve_bb_pity: bbPityAfter };
  } else {
    await db.query('tcg_pve_progress').where({ user_id: internalId }).update({
      pve_win_streak: 0,
      updated_at: nowUnix(),
    });
    progress = { ...progress, pve_win_streak: 0 };
  }

  await tcgEconomy.awardTcgBattleXp(client, discordUser, { won, isPvp: false });

  if (playerRow.lent_source_user_card_id) {
    await db.query.transaction((trx) => tcgLend.recordBorrowedBattleUse(trx, internalId, mainId));
  }

  const pr = Number(progress.current_region);
  const pt = Number(progress.current_tier);

  return {
    ok: true,
    sim,
    encounterPlayerStats: { ...pFinal },
    encounterEnemyStats: { ...eFinal },
    won,
    goldGained,
    pveWinGold: won ? pveWinGold : 0,
    tierClearBonus: won ? tierClearBonusAmount : 0,
    battleBossGold: won ? battleBossGoldAmount : 0,
    isBattleBoss,
    tierCleared: won && tierCleared,
    baseGoldBeforeRegionBonus: baseGoldThisTier,
    region: pr,
    regionName: REGION_NAMES[pr],
    tier: pt,
    tierRoman: TIER_ROMAN[pt - 1],
    progress,
    battlesRequired: battlesRequiredForTier(pt),
    fightRegion,
    playerLabel: playerRow.name,
    enemyLabel: enemyTemplate.name,
    playerLevel: lv,
    battleBossDrop,
    synergyLines: synMod.summaryLines,
    synergyGoldMult: synMod.goldMult,
    synergyWeaknessImmune: synMod.weaknessImmune,
    shardFocusConsumed: combatUsed.shardFocus,
    combatItemsUsed: combatUsed,
    reviveUsed: sim.reviveUsed,
    nullWardUsed: sim.nullWardConsumed,
  };
}

module.exports = {
  getProgressSummary,
  runPveFight,
  travelTo,
  ensureProgress,
};
