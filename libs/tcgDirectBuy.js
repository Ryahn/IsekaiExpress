const db = require('../database/db');
const { normalizeRarityKey } = require('../src/bot/tcg/cardLayout');
const { normalizeElementKey } = require('../src/bot/tcg/elements');
const tcgEconomy = require('./tcgEconomy');
const {
  grantTemplateWithTrx,
  countPlayerInstancesWithClient,
  effectiveInventoryCap,
} = require('./tcgInventory');

/** [CardSystem.md] Direct purchase (gold only). */
const DIRECT_BUY_GOLD_BY_RARITY = {
  C: 300,
  UC: 800,
  R: 2000,
  EP: 5000,
  L: 15000,
  M: 40000,
};

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function directBuyGoldCost(rarityKey) {
  const norm = normalizeRarityKey(rarityKey);
  return DIRECT_BUY_GOLD_BY_RARITY[norm] ?? null;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} buyerDiscordUser
 * @param {{ id: string }} targetDiscordUser Member whose catalog `discord_id` matches templates
 * @param {string} rarityKey
 * @param {string|null|undefined} elementKeyOpt Canonical element id, or null/any to ignore
 */
async function buyDirectCatalogCopy(client, buyerDiscordUser, targetDiscordUser, rarityKey, elementKeyOpt) {
  const norm = normalizeRarityKey(rarityKey);
  const cost = DIRECT_BUY_GOLD_BY_RARITY[norm];
  if (cost == null) {
    return { ok: false, error: 'Invalid rarity for direct purchase.' };
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
          error: `Direct buy costs **${cost}**g for **${norm}** (you have **${gold}**g).`,
        };
        throw new Error('ABORT');
      }

      const cap = effectiveInventoryCap(w);
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
        .where({ discord_id: targetDid, rarity: norm })
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
            ? `No **${norm}** catalog for that member with element **${elementFilter}**.`
            : `No **${norm}** catalog for that member. Their cards may use a different **discord_id** on \`card_data\`.`,
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
  directBuyGoldCost,
  buyDirectCatalogCopy,
};
