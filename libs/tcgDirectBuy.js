const db = require('../database/db');
const { sanitizeRarityAbbrev } = require('../src/bot/tcg/cardLayout');
const { normalizeElementKey } = require('../src/bot/tcg/elements');
const tcgEconomy = require('./tcgEconomy');
const {
  grantTemplateWithTrx,
  countPlayerInstancesWithClient,
  DEFAULT_INVENTORY_CAP,
} = require('./tcgInventory');
const tcgCollectionSets = require('./tcgCollectionSets');

/**
 * Direct purchase (gold) — **Legendary** and **Mythic** are not sold here (drops / player trade only).
 * @type {Record<string, number>}
 */
const DIRECT_BUY_GOLD_BY_RARITY = {
  N: 100,
  C: 300,
  UC: 800,
  R: 2000,
  U: 3200,
  SR: 4200,
  SSR: 5000,
  SUR: 7200,
  UR: 10000,
};

const DIRECT_BUY_DROPS_ONLY = Object.freeze(new Set(['L', 'M']));

function isDirectBuyGoldPurchasable(abbrev) {
  const a = String(abbrev || '').toUpperCase();
  if (DIRECT_BUY_DROPS_ONLY.has(a)) return false;
  return Object.prototype.hasOwnProperty.call(DIRECT_BUY_GOLD_BY_RARITY, a);
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function directBuyGoldCost(rarityKey) {
  const a = sanitizeRarityAbbrev(rarityKey, 'C');
  if (!isDirectBuyGoldPurchasable(a)) {
    return null;
  }
  return DIRECT_BUY_GOLD_BY_RARITY[a] ?? null;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} buyerDiscordUser
 * @param {{ id: string }} targetDiscordUser Member whose catalog `discord_id` matches templates
 * @param {string} rarityKey
 * @param {string|null|undefined} elementKeyOpt Canonical element id, or null/any to ignore
 */
async function buyDirectCatalogCopy(client, buyerDiscordUser, targetDiscordUser, rarityKey, elementKeyOpt) {
  const a = sanitizeRarityAbbrev(rarityKey, 'C');
  if (DIRECT_BUY_DROPS_ONLY.has(a)) {
    return {
      ok: false,
      error: '**Legendary** and **Mythic** are not sold for gold. Get them from drops, packs, or other players (trade / market).',
    };
  }
  const cost = DIRECT_BUY_GOLD_BY_RARITY[a];
  if (cost == null) {
    return {
      ok: false,
      error: 'Invalid rarity for direct purchase, or that tier is not available in the shop.',
    };
  }

  await client.db.checkUser(buyerDiscordUser);
  const buyerInternalId = await tcgEconomy.getInternalUserId(buyerDiscordUser.id);
  if (!buyerInternalId) return { ok: false, error: 'Your profile could not be loaded.' };

  const targetDid = String(targetDiscordUser.id);
  let elementFilter = null;
  if (elementKeyOpt != null && String(elementKeyOpt).trim() !== '') {
    elementFilter = normalizeElementKey(elementKeyOpt);
    if (!elementFilter) {
      return { ok: false, error: 'Unknown **element**. Pick a valid element or omit for any.' };
    }
  }

  let result;
  try {
    await db.query.transaction(async (trx) => {
      await tcgEconomy.ensureWallet(buyerInternalId, trx);
      const w = await trx('user_wallets').where({ user_id: buyerInternalId }).forUpdate().first();
      const gold = Number(w.gold);
      if (gold < cost) {
        result = {
          ok: false,
          error: `Direct buy costs **${cost}**g for **${a}** (you have **${gold}**g).`,
        };
        throw new Error('ABORT');
      }

      const cap = await tcgCollectionSets.resolveInventoryCap(trx, buyerInternalId, w, DEFAULT_INVENTORY_CAP);
      const owned = await countPlayerInstancesWithClient(buyerInternalId, trx);
      if (owned + 1 > cap) {
        const free = cap - owned;
        result = {
          ok: false,
          error: `Need **1** free inventory slot (you have **${free}**).`,
        };
        throw new Error('ABORT');
      }

      let q = trx('card_data')
        .where({ discord_id: targetDid, rarity: a })
        .whereNotNull('base_atk')
        .whereNotNull('base_def')
        .whereNotNull('base_spd')
        .whereNotNull('base_hp')
        .whereNotNull('base_power');

      if (elementFilter) q = q.andWhere({ element: elementFilter });

      const rows = await q.select('*');
      if (!rows.length) {
        result = {
          ok: false,
          error: elementFilter
            ? `No **${a}** catalog for that member with element **${elementFilter}**.`
            : `No **${a}** catalog for that member. Their cards may use a different **discord_id** on \`card_data\`.`,
        };
        throw new Error('ABORT');
      }

      const template = rows[Math.floor(Math.random() * rows.length)];
      const g = await grantTemplateWithTrx(trx, buyerInternalId, template, {});
      if (!g.ok) {
        result = g;
        throw new Error('ABORT');
      }

      const ts = nowUnix();
      const newGold = gold - cost;
      await trx('user_wallets').where({ user_id: buyerInternalId }).update({
        gold: newGold,
        updated_at: ts,
      });

      result = {
        ok: true,
        cost,
        newGold,
        grant: g,
        matchCount: rows.length,
      };
    });
  } catch (e) {
    if (e.message === 'ABORT' && result) return result;
    throw e;
  }

  return result;
}

module.exports = {
  DIRECT_BUY_GOLD_BY_RARITY,
  DIRECT_BUY_DROPS_ONLY,
  isDirectBuyGoldPurchasable,
  directBuyGoldCost,
  buyDirectCatalogCopy,
};
