const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');
const { MAX_STORED_COMBAT_CHARGES } = require('./tcgCombatBuffs');

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function utcDateString() {
  return new Date().toISOString().slice(0, 10);
}

function capStack(n) {
  return Math.min(MAX_STORED_COMBAT_CHARGES, Math.max(0, n));
}

/**
 * @typedef {object} ShopChargeGrant
 * @property {string} column
 * @property {number} perPurchase
 */

/**
 * [CardSystem.md] Item Shop — regular table (featured slot not implemented here).
 * @type {Record<string, {
 *   label: string,
 *   description: string,
 *   cost: number,
 *   serverDailyLimit: number,
 *   playerDailyLimit: number,
 *   bonusSlots?: number,
 *   charge?: ShopChargeGrant,
 *   xpBoosterHours?: number,
 *   setRarityDustNextFuse?: boolean,
 * }>}
 */
const SHOP_ITEMS = Object.freeze({
  inventory_expander: Object.freeze({
    label: 'Inventory Expander',
    description: '+**10** permanent card slots ([CardSystem.md]).',
    cost: 3000,
    serverDailyLimit: 3,
    playerDailyLimit: 1,
    bonusSlots: 10,
  }),
  shard_of_focus: Object.freeze({
    label: 'Shard of Focus',
    description: '+**15%** ATK on your **next** PvE or spar fight (consumes **1** charge).',
    cost: 200,
    serverDailyLimit: 50,
    playerDailyLimit: 3,
    charge: { column: 'tcg_shard_focus_charges', perPurchase: 1 },
  }),
  iron_veil: Object.freeze({
    label: 'Iron Veil',
    description: '+**20%** DEF on your **next** PvE or spar fight (consumes **1** charge).',
    cost: 200,
    serverDailyLimit: 50,
    playerDailyLimit: 3,
    charge: { column: 'tcg_iron_veil_charges', perPurchase: 1 },
  }),
  overclock_chip: Object.freeze({
    label: 'Overclock Chip',
    description: '+**25%** SPD on your **next** PvE or spar fight (consumes **1** charge).',
    cost: 250,
    serverDailyLimit: 30,
    playerDailyLimit: 2,
    charge: { column: 'tcg_overclock_charges', perPurchase: 1 },
  }),
  null_ward: Object.freeze({
    label: 'Null Ward',
    description: '**Next** fight: negates the **first** enemy elemental **×>1** hit vs you (consumes **1** charge).',
    cost: 500,
    serverDailyLimit: 20,
    playerDailyLimit: 1,
    charge: { column: 'tcg_null_ward_charges', perPurchase: 1 },
  }),
  revive_shard: Object.freeze({
    label: 'Revive Shard',
    description: '**Next** fight: if you **lose** at 0 HP, **revive once** at **30%** max HP vs foe’s remaining HP (consumes **1** charge if revive triggers).',
    cost: 800,
    serverDailyLimit: 15,
    playerDailyLimit: 1,
    charge: { column: 'tcg_revive_shard_charges', perPurchase: 1 },
  }),
  fusion_catalyst: Object.freeze({
    label: 'Fusion Catalyst',
    description: '**1** use — **next** level-up fuse needs **only one** copy (+catalyst) instead of two ([CardSystem.md]).',
    cost: 1000,
    serverDailyLimit: 10,
    playerDailyLimit: 1,
    charge: { column: 'tcg_fusion_catalyst_charges', perPurchase: 1 },
  }),
  rarity_dust: Object.freeze({
    label: 'Rarity Dust',
    description: '**Next** fuse: **12%** chance the result bumps **one** rarity tier (same character pool).',
    cost: 2500,
    serverDailyLimit: 5,
    playerDailyLimit: 1,
    setRarityDustNextFuse: true,
  }),
  preservation_seal: Object.freeze({
    label: 'Preservation Seal',
    description: '**1** application charge — use `/tcg craft seal` on a copy: blocks **reroll**, **trade**, **breakdown**; wager rules when PvP wagers ship.',
    cost: 1500,
    serverDailyLimit: 10,
    playerDailyLimit: 1,
    charge: { column: 'tcg_preservation_seal_charges', perPurchase: 1 },
  }),
  recall_token: Object.freeze({
    label: 'Recall Token',
    description: '**1** use — ends an **active** lend instantly (either party, `/tcg lend recall`).',
    cost: 600,
    serverDailyLimit: 25,
    playerDailyLimit: 2,
    charge: { column: 'tcg_recall_token_charges', perPurchase: 1 },
  }),
  trade_license: Object.freeze({
    label: 'Trade License',
    description: '**1** trade — when **offering gold** in `/tcg trade offer`, use `tax_free:true` to skip **3%** tax on that deal.',
    cost: 400,
    serverDailyLimit: 20,
    playerDailyLimit: 2,
    charge: { column: 'tcg_trade_license_charges', perPurchase: 1 },
  }),
  xp_booster: Object.freeze({
    label: 'XP Booster',
    description: '**2×** message XP for **24h** (stacks by extending time from current booster end).',
    cost: 1000,
    serverDailyLimit: 15,
    playerDailyLimit: 1,
    xpBoosterHours: 24,
  }),
});

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function getShopSnapshot(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  const day = utcDateString();
  const items = [];

  for (const [sku, def] of Object.entries(SHOP_ITEMS)) {
    const server = await db.query('tcg_shop_server_daily').where({ day_utc: day, sku }).first();
    const sold = server ? Number(server.sold_count) : 0;
    let mine = 0;
    if (internalId) {
      const ur = await db
        .query('tcg_shop_user_daily')
        .where({ user_id: internalId, day_utc: day, sku })
        .first();
      mine = ur ? Number(ur.purchase_count) : 0;
    }
    items.push({
      sku,
      label: def.label,
      description: def.description,
      cost: def.cost,
      serverRemaining: Math.max(0, def.serverDailyLimit - sold),
      playerRemaining: Math.max(0, def.playerDailyLimit - mine),
    });
  }

  return { dayUtc: day, items };
}

async function lockOrCreateServerRow(trx, day, sku) {
  let row = await trx('tcg_shop_server_daily').where({ day_utc: day, sku }).forUpdate().first();
  if (row) return row;
  try {
    await trx('tcg_shop_server_daily').insert({ day_utc: day, sku, sold_count: 0 });
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e;
  }
  return trx('tcg_shop_server_daily').where({ day_utc: day, sku }).forUpdate().first();
}

async function lockOrCreateUserRow(trx, internalUserId, day, sku) {
  let row = await trx('tcg_shop_user_daily')
    .where({ user_id: internalUserId, day_utc: day, sku })
    .forUpdate()
    .first();
  if (row) return row;
  try {
    await trx('tcg_shop_user_daily').insert({
      user_id: internalUserId,
      day_utc: day,
      sku,
      purchase_count: 0,
    });
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e;
  }
  return trx('tcg_shop_user_daily')
    .where({ user_id: internalUserId, day_utc: day, sku })
    .forUpdate()
    .first();
}

/**
 * Merge item effects into a wallet update object (no gold change).
 * @param {Record<string, unknown>} w wallet row
 * @param {typeof SHOP_ITEMS[string]} def
 * @param {number} ts
 */
function buildWalletPatchForSkuDef(w, def, ts) {
  const walletPatch = { updated_at: ts };
  const slotBonus = Number(def.bonusSlots) || 0;
  const bonusBefore = Number(w.tcg_inventory_bonus_slots) || 0;
  const bonusAfter = bonusBefore + slotBonus;
  if (slotBonus) walletPatch.tcg_inventory_bonus_slots = bonusAfter;

  if (def.charge) {
    const col = def.charge.column;
    const per = Number(def.charge.perPurchase) || 0;
    const before = Number(w[col]) || 0;
    walletPatch[col] = capStack(before + per);
  }

  if (def.setRarityDustNextFuse) {
    walletPatch.tcg_rarity_dust_next_fuse = 1;
  }

  if (def.xpBoosterHours) {
    const add = def.xpBoosterHours * 3600;
    const cur = w.tcg_xp_booster_until != null ? Number(w.tcg_xp_booster_until) : 0;
    const base = Math.max(ts, cur);
    walletPatch.tcg_xp_booster_until = base + add;
  }

  return { walletPatch, bonusSlotsAdded: slotBonus, bonusAfter, bonusBefore };
}

/**
 * Apply [CardSystem.md] shop item grants only (Featured Pool A / internal use). No gold, no daily caps.
 * @param {import('knex').Knex} trx
 * @param {number} internalUserId
 * @param {string} sku
 */
async function grantShopSkuEffectsOnly(trx, internalUserId, sku) {
  const def = SHOP_ITEMS[sku];
  if (!def) return { ok: false, error: 'Unknown shop item.' };
  await tcgEconomy.ensureWallet(internalUserId, trx);
  const w = await trx('user_wallets').where({ user_id: internalUserId }).forUpdate().first();
  const ts = nowUnix();
  const { walletPatch } = buildWalletPatchForSkuDef(w, def, ts);
  await trx('user_wallets').where({ user_id: internalUserId }).update(walletPatch);
  return { ok: true, label: def.label, walletPatch };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {string} sku
 */
async function buyShopItem(client, discordUser, sku) {
  const def = SHOP_ITEMS[sku];
  if (!def) return { ok: false, error: 'Unknown shop item.' };

  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'Profile not found.' };

  const day = utcDateString();
  let result;

  try {
    await db.query.transaction(async (trx) => {
      await tcgEconomy.ensureWallet(internalId, trx);
      const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      const gold = Number(w.gold);
      if (gold < def.cost) {
        result = {
          ok: false,
          error: `**${def.label}** costs **${def.cost}**g (you have **${gold}**g).`,
        };
        throw new Error('SHOP_ABORT');
      }

      const serverRow = await lockOrCreateServerRow(trx, day, sku);
      const sold = Number(serverRow.sold_count);
      if (sold >= def.serverDailyLimit) {
        result = { ok: false, error: `**${def.label}** is sold out for today (server cap).` };
        throw new Error('SHOP_ABORT');
      }

      const userRow = await lockOrCreateUserRow(trx, internalId, day, sku);
      const bought = Number(userRow.purchase_count);
      if (bought >= def.playerDailyLimit) {
        result = {
          ok: false,
          error: `You already bought **${def.label}** today (**${def.playerDailyLimit}**/day).`,
        };
        throw new Error('SHOP_ABORT');
      }

      const newGold = gold - def.cost;
      const ts = nowUnix();
      const { walletPatch: effectPatch, bonusSlotsAdded, bonusAfter, bonusBefore } = buildWalletPatchForSkuDef(
        w,
        def,
        ts,
      );
      const walletPatch = { ...effectPatch, gold: newGold };

      await trx('user_wallets').where({ user_id: internalId }).update(walletPatch);

      await trx('tcg_shop_server_daily').where({ day_utc: day, sku }).increment('sold_count', 1);

      await trx('tcg_shop_user_daily')
        .where({ user_id: internalId, day_utc: day, sku })
        .increment('purchase_count', 1);

      const chargeCol = def.charge ? def.charge.column : null;
      const chargeAfter = chargeCol ? walletPatch[chargeCol] : null;

      result = {
        ok: true,
        sku,
        label: def.label,
        cost: def.cost,
        newGold,
        bonusSlotsAdded,
        inventoryBonusSlots: bonusSlotsAdded ? bonusAfter : bonusBefore,
        chargeColumn: chargeCol,
        chargeAfter: chargeAfter != null ? chargeAfter : undefined,
        rarityDustPrimed: !!def.setRarityDustNextFuse,
        xpBoosterUntil: walletPatch.tcg_xp_booster_until,
      };
    });
  } catch (e) {
    if (e.message === 'SHOP_ABORT' && result) return result;
    throw e;
  }

  return result;
}

module.exports = {
  SHOP_ITEMS,
  utcDateString,
  getShopSnapshot,
  buyShopItem,
  capStack,
  buildWalletPatchForSkuDef,
  grantShopSkuEffectsOnly,
  lockOrCreateUserRow,
};
