const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function utcDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** [CardSystem.md] Item Shop — extend with more SKUs over time. */
const SHOP_ITEMS = Object.freeze({
  inventory_expander: Object.freeze({
    label: 'Inventory Expander',
    description: '+**10** permanent card slots ([CardSystem.md]).',
    cost: 3000,
    serverDailyLimit: 3,
    playerDailyLimit: 1,
    bonusSlots: 10,
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

      const slotBonus = Number(def.bonusSlots) || 0;
      const bonusBefore = Number(w.tcg_inventory_bonus_slots) || 0;
      const bonusAfter = bonusBefore + slotBonus;
      const newGold = gold - def.cost;
      const ts = nowUnix();

      const walletPatch = { gold: newGold, updated_at: ts };
      if (slotBonus) walletPatch.tcg_inventory_bonus_slots = bonusAfter;
      await trx('user_wallets').where({ user_id: internalId }).update(walletPatch);

      await trx('tcg_shop_server_daily').where({ day_utc: day, sku }).increment('sold_count', 1);

      await trx('tcg_shop_user_daily')
        .where({ user_id: internalId, day_utc: day, sku })
        .increment('purchase_count', 1);

      result = {
        ok: true,
        sku,
        label: def.label,
        cost: def.cost,
        newGold,
        bonusSlotsAdded: slotBonus,
        inventoryBonusSlots: slotBonus ? bonusAfter : bonusBefore,
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
};
