const db = require('../database/db');

/** [CardSystem.md] Shard of Focus — +15% ATK for one fight. */
const SHARD_FOCUS_ATK_MULTIPLIER = 1.15;
/** Iron Veil — +20% DEF for one fight. */
const IRON_VEIL_DEF_MULTIPLIER = 1.2;
/** Overclock Chip — +25% SPD for one fight. */
const OVERCLOCK_SPD_MULTIPLIER = 1.25;
const MAX_STORED_COMBAT_CHARGES = 99;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function applyShardFocusToAtkStats(pStats) {
  return { ...pStats, atk: Math.round(pStats.atk * SHARD_FOCUS_ATK_MULTIPLIER) };
}

function applyIronVeilToDefStats(pStats) {
  return { ...pStats, def: Math.round(pStats.def * IRON_VEIL_DEF_MULTIPLIER) };
}

function applyOverclockToSpdStats(pStats) {
  return { ...pStats, spd: Math.round(pStats.spd * OVERCLOCK_SPD_MULTIPLIER) };
}

async function getShardFocusCharges(internalUserId) {
  const w = await db.query('user_wallets').where({ user_id: internalUserId }).first();
  return Number(w?.tcg_shard_focus_charges) || 0;
}

/**
 * @returns {Promise<{
 *   shardFocus: number,
 *   ironVeil: number,
 *   overclock: number,
 *   nullWard: number,
 *   revive: number,
 * }>}
 */
async function getCombatChargeCounts(internalUserId) {
  const w = await db.query('user_wallets').where({ user_id: internalUserId }).first();
  return {
    shardFocus: Number(w?.tcg_shard_focus_charges) || 0,
    ironVeil: Number(w?.tcg_iron_veil_charges) || 0,
    overclock: Number(w?.tcg_overclock_charges) || 0,
    nullWard: Number(w?.tcg_null_ward_charges) || 0,
    revive: Number(w?.tcg_revive_shard_charges) || 0,
  };
}

async function consumeShardFocusCharge(internalUserId) {
  let ok = false;
  await db.query.transaction(async (trx) => {
    const w = await trx('user_wallets').where({ user_id: internalUserId }).forUpdate().first();
    const c = Number(w?.tcg_shard_focus_charges) || 0;
    if (c < 1) return;
    await trx('user_wallets').where({ user_id: internalUserId }).update({
      tcg_shard_focus_charges: c - 1,
      updated_at: nowUnix(),
    });
    ok = true;
  });
  return ok;
}

/**
 * After PvE/spar, decrement charges that were “armed” for this fight.
 * @param {object} consumed
 * @param {boolean} [consumed.shardFocus]
 * @param {boolean} [consumed.ironVeil]
 * @param {boolean} [consumed.overclock]
 * @param {boolean} [consumed.nullWard] — set when Null Ward was available at fight start (charge spent win or lose)
 * @param {boolean} [consumed.revive] — from sim.reviveUsed
 */
async function consumeCombatChargesAfterBattle(internalUserId, consumed) {
  await db.query.transaction(async (trx) => {
    const w = await trx('user_wallets').where({ user_id: internalUserId }).forUpdate().first();
    if (!w) return;

    const patch = { updated_at: nowUnix() };
    let any = false;

    const dec = (field, should) => {
      if (!should) return;
      const c = Number(w[field]) || 0;
      if (c < 1) return;
      w[field] = c - 1;
      patch[field] = c - 1;
      any = true;
    };

    dec('tcg_shard_focus_charges', consumed.shardFocus);
    dec('tcg_iron_veil_charges', consumed.ironVeil);
    dec('tcg_overclock_charges', consumed.overclock);
    dec('tcg_null_ward_charges', consumed.nullWard);
    dec('tcg_revive_shard_charges', consumed.revive);

    if (any) {
      await trx('user_wallets').where({ user_id: internalUserId }).update(patch);
    }
  });
}

module.exports = {
  SHARD_FOCUS_ATK_MULTIPLIER,
  IRON_VEIL_DEF_MULTIPLIER,
  OVERCLOCK_SPD_MULTIPLIER,
  MAX_STORED_COMBAT_CHARGES,
  applyShardFocusToAtkStats,
  applyIronVeilToDefStats,
  applyOverclockToSpdStats,
  getShardFocusCharges,
  getCombatChargeCounts,
  consumeShardFocusCharge,
  consumeCombatChargesAfterBattle,
};
