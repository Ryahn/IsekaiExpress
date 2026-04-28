const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');

const GRADE_ORDER = ['D', 'C', 'B', 'A', 'S'];

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function nextGrade(g) {
  const u = String(g || 'D').toUpperCase();
  const i = GRADE_ORDER.indexOf(u);
  if (i < 0 || i >= GRADE_ORDER.length - 1) return null;
  return GRADE_ORDER[i + 1];
}

/** @returns {{ shards: number, diamonds: number, rubies: number }|null} */
function pickPayment(trxWalletRow, fromG, toG, useShardFallback) {
  const hs = Number(trxWalletRow.tcg_shards) || 0;
  const hd = Number(trxWalletRow.tcg_diamonds) || 0;
  const hr = Number(trxWalletRow.tcg_rubies) || 0;
  const f = String(fromG || 'D').toUpperCase();
  const t = String(toG || 'C').toUpperCase();

  if (f === 'D' && t === 'C') {
    if (hs >= 25) return { shards: 25, diamonds: 0, rubies: 0 };
    return null;
  }
  if (f === 'C' && t === 'B') {
    if (hs >= 45) return { shards: 45, diamonds: 0, rubies: 0 };
    return null;
  }
  if (f === 'B' && t === 'A') {
    if (useShardFallback && hs >= 220) return { shards: 220, diamonds: 0, rubies: 0 };
    if (hd >= 12) return { shards: 0, diamonds: 12, rubies: 0 };
    return null;
  }
  if (f === 'A' && t === 'S') {
    if (useShardFallback && hs >= 900) return { shards: 900, diamonds: 0, rubies: 0 };
    if (hr >= 8 && hd >= 90) return { shards: 0, diamonds: 90, rubies: 8 };
    return null;
  }
  return null;
}

const PITY_FORCE = 6;

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} userCardId
 * @param {boolean} [useShardFallback]
 */
async function attemptRegrade(client, discordUser, userCardId, useShardFallback = false) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let out;
  await db.query.transaction(async (trx) => {
    const row = await trx('user_cards')
      .where({ user_card_id: userCardId, user_id: internalId })
      .forUpdate()
      .first();
    if (!row) {
      out = { ok: false, error: 'Copy not found.' };
      return;
    }
    if (row.is_lent || row.is_escrowed) {
      out = { ok: false, error: 'Cannot regrade lent/escrowed copies.' };
      return;
    }

    const cur = String(row.grade || 'D').toUpperCase();
    const ng = nextGrade(cur);
    if (!ng) {
      out = { ok: false, error: 'Already **S** grade.' };
      return;
    }

    await tcgEconomy.ensureWallet(internalId, trx);
    const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
    const pay = pickPayment(w, cur, ng, useShardFallback);
    if (!pay) {
      out = {
        ok: false,
        error:
          'Not enough resources. B→A: **12** diamonds or **`use_shard_fallback`** (**220** shards). A→S: **8** rubies + **90** diamonds or fallback **900** shards.',
      };
      return;
    }

    const spend = await tcgEconomy.trySpendTcgResources(trx, internalId, pay);
    if (!spend.ok) {
      out = spend;
      return;
    }

    let pity = Number(row.regrade_pity) || 0;
    const success = pity >= PITY_FORCE || Math.random() < 0.55;
    if (!success) {
      pity += 1;
      await trx('user_cards').where({ user_card_id: userCardId }).update({
        regrade_pity: pity,
        updated_at: nowUnix(),
      });
      out = { ok: true, success: false, pityNow: pity, paid: pay };
      return;
    }

    await trx('user_cards').where({ user_card_id: userCardId }).update({
      grade: ng,
      regrade_pity: 0,
      updated_at: nowUnix(),
    });
    out = { ok: true, success: true, newGrade: ng, paid: pay };
  });

  return out || { ok: false, error: 'Regrade failed.' };
}

module.exports = {
  attemptRegrade,
  nextGrade,
  GRADE_ORDER,
  PITY_FORCE,
};
