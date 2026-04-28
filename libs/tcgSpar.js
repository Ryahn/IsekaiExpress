const db = require('../database/db');
const { statLevelMultiplier } = require('../src/bot/tcg/cardLayout');
const { sanitizeRarityAbbrev } = require('../src/bot/tcg/rarityOrder');
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
const tcgSessionLoadout = require('./tcgSessionLoadout');

/** [CardSystem.md] PvE Tier I–III win — used for casual spar until region progression ships. */
const SPAR_WIN_GOLD = 10;

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function runSpar(client, discordUser) {
  const detail = await tcgLoadout.getLoadoutDetail(client, discordUser);
  if (!detail || !detail.row.main_user_card_id) {
    return { ok: false, error: 'Set a **main** fighter with `/tcg squad equip` (slot: Main).' };
  }

  const mainId = detail.row.main_user_card_id;
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  if (await tcgSessionLoadout.isUserCardOnActiveExpedition(internalId, mainId)) {
    return { ok: false, error: 'Your **main** card is on **expedition**.' };
  }

  await tcgLend.expireDueLoans(db.query);

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
    return { ok: false, error: 'Main card is no longer in your inventory. Pick another main.' };
  }

  let pStats = tcgInventory.combatStatsFromJoinedRow(playerRow);
  if (!pStats) {
    return { ok: false, error: 'Main card is missing base stats (not a catalog template).' };
  }

  const enemyTemplate = await db.query('card_data')
    .whereNotNull('base_atk')
    .whereNotNull('base_def')
    .whereNotNull('base_spd')
    .whereNotNull('base_hp')
    .orderByRaw('RAND()')
    .first();

  if (!enemyTemplate) {
    return { ok: false, error: 'No catalog templates in the database.' };
  }

  const synMod = tcgSynergy.computeCombatSynergy(
    { main: detail.main, support1: detail.support1, support2: detail.support2 },
    enemyTemplate.element,
  );
  pStats = tcgSynergy.applySynergyToStats(pStats, synMod);

  const memberDiscordId = playerRow.discord_id;
  const memberDistinct =
    memberDiscordId != null
      ? await tcgInventory.countDistinctRaritiesForMember(internalId, memberDiscordId)
      : 0;

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
  const mult = statLevelMultiplier(lv);
  let enemyStats = {
    atk: Math.round(Number(enemyTemplate.base_atk) * mult),
    def: Math.round(Number(enemyTemplate.base_def) * mult),
    spd: Math.round(Number(enemyTemplate.base_spd) * mult),
    hp: Math.round(Number(enemyTemplate.base_hp) * mult),
  };
  if (synMod.enemyDefPct) {
    const m = 1 + Number(synMod.enemyDefPct);
    enemyStats = { ...enemyStats, def: Math.max(1, Math.round(enemyStats.def * m)) };
  }

  let mythicSignatureKey = null;
  if (
    memberDiscordId != null
    && memberDistinct >= 6
    && sanitizeRarityAbbrev(playerRow.rarity, 'C') === 'M'
  ) {
    mythicSignatureKey = await tcgSetProgress.resolveMythicSignatureKey(memberDiscordId);
  }

  const sim = tcgBattle.simulateMainVsMain(pStats, enemyStats, playerRow.element, enemyTemplate.element, {
    playerLabel: playerRow.name || 'You',
    enemyLabel: enemyTemplate.name ? `${enemyTemplate.name} (spar)` : 'Spar bot',
    defenderWeaknessImmune: synMod.weaknessImmune,
    negateEnemyElementAdvantageOnce: combatUsed.nullWard,
    reviveOnLoss,
    playerNegateFirstHit: Boolean(synMod.playerNegateFirstHit),
    enemyAbilityProcPenalty: Number(synMod.enemyAbilityProcPenalty) || 0,
    combat: {
      player: tcgAbilityBattle.buildPlayerCombatSide({
        instanceAbilityKey: playerRow.ability_key,
        classKey: playerRow.class,
        rarityKey: playerRow.rarity,
        grantedSynergyAbilityKey: synMod.grantedBattleAbilityKey,
        distinctRaritiesForMember: memberDistinct,
        signatureOverrideKey: mythicSignatureKey,
        synergyProcBonus: Number(synMod.elementAbilityProcBonus) || 0,
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
  if (won) {
    const setGoldM = tcgCollectionSets.battleGoldMultiplier(memberDistinct);
    const commanderM =
      tcgAbilityBattle.normClassKey(detail.main?.class) === 'commander'
        ? 1 + tcgAbilityBattle.COMMANDER_BATTLE_GOLD_BONUS
        : 1;
    const winGoldBase = Math.floor(SPAR_WIN_GOLD * synMod.goldMult * setGoldM * commanderM);
    let payBorrower = winGoldBase;
    let payLender = 0;
    let lenderInternalId = null;
    if (playerRow.lent_source_user_card_id) {
      const srcRow = await db
        .query('user_cards')
        .where({ user_card_id: Number(playerRow.lent_source_user_card_id) })
        .first();
      if (srcRow) {
        lenderInternalId = Number(srcRow.user_id);
        payBorrower = Math.floor(winGoldBase * 0.6);
        payLender = winGoldBase - payBorrower;
      }
    }
    if (payBorrower > 0) {
      const g = await tcgEconomy.addGold(client, discordUser, payBorrower);
      if (!g.ok) return g;
    }
    if (payLender > 0 && lenderInternalId) {
      await tcgEconomy.incrementGoldInternal(lenderInternalId, payLender);
    }
    goldGained = winGoldBase;
  }

  await tcgEconomy.awardTcgBattleXp(client, discordUser, { won, isPvp: false });

  if (playerRow.lent_source_user_card_id) {
    await db.query.transaction((trx) =>
      tcgLend.recordBorrowedBattleUse(trx, internalId, mainId),
    );
  }

  return {
    ok: true,
    sim,
    goldGained,
    won,
    playerLabel: playerRow.name,
    enemyLabel: enemyTemplate.name,
    playerLevel: lv,
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
  runSpar,
  SPAR_WIN_GOLD,
};
