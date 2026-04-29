const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');
const tcgLoadout = require('./tcgLoadout');

const OFFER_EXPIRE_SEC = 24 * 60 * 60;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

async function expirePendingOffers(trx) {
  const now = nowUnix();
  await trx('tcg_lend_contracts')
    .where({ status: 'pending' })
    .where('offer_expires_at', '<', now)
    .update({ status: 'cancelled' });
}

async function finalizeLoan(trx, contract, reason) {
  const { lend_id: lendId, lender_card_id: lenderCardId, borrower_card_id: borrowerCardId } = contract;
  if (borrowerCardId) {
    await tcgLoadout.clearLoadoutSlotsReferencingInstance(
      trx,
      Number(contract.borrower_user_id),
      Number(borrowerCardId),
    );
    await trx('user_cards').where({ user_card_id: borrowerCardId }).delete();
  }
  await trx('user_cards').where({ user_card_id: lenderCardId }).update({
    is_lent: false,
    updated_at: nowUnix(),
  });
  await trx('tcg_lend_contracts').where({ lend_id: lendId }).update({
    status: reason,
    loan_end_at: null,
    borrower_card_id: null,
  });
}

/**
 * Ends active loans past `loan_end_at` or over battle cap.
 * @param {import('knex').Knex} [trx]
 */
async function expireDueLoans(trx = db.query) {
  const now = nowUnix();
  const rows = await trx('tcg_lend_contracts').where({ status: 'active' });
  for (const c of rows) {
    const maxB = c.max_battles != null ? Number(c.max_battles) : null;
    const used = Number(c.battles_used) || 0;
    const endAt = c.loan_end_at != null ? Number(c.loan_end_at) : null;
    if ((endAt != null && endAt <= now) || (maxB != null && used >= maxB)) {
      await finalizeLoan(trx, c, 'completed');
    }
  }
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} lenderDiscord
 * @param {{ id: string, username: string }} borrowerDiscord
 * @param {number} lenderInstanceId
 * @param {number} priceGold
 * @param {number} durationHours
 * @param {number|null} maxBattles
 */
async function createLendOffer(
  client,
  lenderDiscord,
  borrowerDiscord,
  lenderInstanceId,
  priceGold,
  durationHours,
  maxBattles,
) {
  if (String(lenderDiscord.id) === String(borrowerDiscord.id)) {
    return { ok: false, error: 'You cannot lend to yourself.' };
  }
  const price = Math.max(0, Math.floor(Number(priceGold) || 0));
  const hours = Math.min(168, Math.max(1, Math.floor(Number(durationHours) || 0)));
  const maxB =
    maxBattles == null || maxBattles === undefined
      ? null
      : Math.min(500, Math.max(1, Math.floor(Number(maxBattles))));

  await client.db.checkUser(lenderDiscord);
  await client.db.checkUser(borrowerDiscord);

  const lenderId = await tcgEconomy.getInternalUserId(lenderDiscord.id);
  const borrowerId = await tcgEconomy.getInternalUserId(borrowerDiscord.id);
  if (!lenderId || !borrowerId) {
    return { ok: false, error: 'Both users need profiles.' };
  }

  let result;
  await db.query.transaction(async (trx) => {
    await expirePendingOffers(trx);

    const inst = await trx('user_cards')
      .where({ user_card_id: lenderInstanceId, user_id: lenderId })
      .forUpdate()
      .first();
    if (!inst) {
      result = { ok: false, error: 'Copy not found in your inventory.' };
      return;
    }
    if (inst.is_lent || inst.is_escrowed) {
      result = { ok: false, error: 'Cannot lend a lent or escrowed card.' };
      return;
    }
    if (Number(inst.tcg_preservation_sealed)) {
      result = { ok: false, error: 'Cannot lend a Preservation Sealed card.' };
      return;
    }
    if (inst.lent_source_user_card_id) {
      result = { ok: false, error: 'Cannot lend a **borrowed** copy.' };
      return;
    }

    const activeOther = await trx('tcg_lend_contracts')
      .where({ lender_card_id: lenderInstanceId })
      .whereIn('status', ['pending', 'active'])
      .first();
    if (activeOther) {
      result = { ok: false, error: 'This copy already has a lend offer or active loan.' };
      return;
    }

    const ts = nowUnix();
    const [lid] = await trx('tcg_lend_contracts').insert({
      lender_user_id: lenderId,
      borrower_user_id: borrowerId,
      lender_card_id: lenderInstanceId,
      borrower_card_id: null,
      price_gold: price,
      duration_sec: hours * 3600,
      max_battles: maxB,
      battles_used: 0,
      status: 'pending',
      created_at: ts,
      offer_expires_at: ts + OFFER_EXPIRE_SEC,
      loan_end_at: null,
    });

    result = {
      ok: true,
      lendId: Number(lid),
      offerExpiresAt: ts + OFFER_EXPIRE_SEC,
    };
  });

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} borrowerDiscord
 * @param {number} lendId
 */
async function acceptLendOffer(client, borrowerDiscord, lendId) {
  await client.db.checkUser(borrowerDiscord);
  const borrowerId = await tcgEconomy.getInternalUserId(borrowerDiscord.id);
  if (!borrowerId) return { ok: false, error: 'Profile not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    await expirePendingOffers(trx);

    const c = await trx('tcg_lend_contracts').where({ lend_id: lendId }).forUpdate().first();
    if (!c || c.status !== 'pending') {
      result = { ok: false, error: 'Offer not found or not pending.' };
      return;
    }
    if (Number(c.borrower_user_id) !== borrowerId) {
      result = { ok: false, error: 'This lend is for someone else.' };
      return;
    }
    const now = nowUnix();
    if (Number(c.offer_expires_at) < now) {
      await trx('tcg_lend_contracts').where({ lend_id: lendId }).update({ status: 'cancelled' });
      result = { ok: false, error: 'This lend offer **expired**.' };
      return;
    }

    const lenderId = Number(c.lender_user_id);
    const lenderCardId = Number(c.lender_card_id);
    const price = Math.floor(Number(c.price_gold) || 0);

    const inst = await trx('user_cards')
      .where({ user_card_id: lenderCardId, user_id: lenderId })
      .forUpdate()
      .first();
    if (!inst || inst.is_lent || inst.is_escrowed) {
      result = { ok: false, error: 'Lender no longer has this copy available.' };
      return;
    }

    if (price > 0) {
      await tcgEconomy.ensureWallet(borrowerId, trx);
      await tcgEconomy.ensureWallet(lenderId, trx);
      const wB = await trx('user_wallets').where({ user_id: borrowerId }).forUpdate().first();
      const wL = await trx('user_wallets').where({ user_id: lenderId }).forUpdate().first();
      if (Number(wB.gold) < price) {
        result = { ok: false, error: `Need **${price}**g to borrow (you have **${Number(wB.gold)}**g).` };
        return;
      }
      const ts = nowUnix();
      await trx('user_wallets')
        .where({ user_id: borrowerId })
        .update({ gold: Number(wB.gold) - price, updated_at: ts });
      await trx('user_wallets')
        .where({ user_id: lenderId })
        .update({ gold: Number(wL.gold) + price, updated_at: ts });
    }

    const ts = nowUnix();
    const loanEnd = ts + Number(c.duration_sec);
    await trx('user_cards').where({ user_card_id: lenderCardId }).update({
      is_lent: true,
      updated_at: ts,
    });

    const [borrowerCopyId] = await trx('user_cards').insert({
      user_id: borrowerId,
      card_id: inst.card_id,
      ability_key: inst.ability_key,
      level: inst.level,
      grade: inst.grade || 'D',
      regrade_pity: Number(inst.regrade_pity) || 0,
      acquired_at: ts,
      is_lent: false,
      is_escrowed: false,
      element_reroll_count: inst.element_reroll_count || 0,
      tcg_preservation_sealed: false,
      tcg_element_locked: !!Number(inst.tcg_element_locked),
      tcg_golden_frame: !!Number(inst.tcg_golden_frame),
      lent_source_user_card_id: lenderCardId,
      updated_at: ts,
      created_at: ts,
    });

    await trx('tcg_lend_contracts').where({ lend_id: lendId }).update({
      status: 'active',
      borrower_card_id: borrowerCopyId,
      loan_end_at: loanEnd,
    });

    result = { ok: true, lendId, borrowerCopyId, loanEndAt: loanEnd };
  });

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function listMyLends(client, discordUser) {
  await client.db.checkUser(discordUser);
  const uid = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!uid) return { ok: false, rows: [] };

  await expirePendingOffers(db.query);
  await expireDueLoans(db.query);

  const rows = await db
    .query('tcg_lend_contracts as l')
    .join('user_cards as lc', 'l.lender_card_id', 'lc.user_card_id')
    .join('card_data as cd', 'lc.card_id', 'cd.card_id')
    .where((q) => q.where('l.lender_user_id', uid).orWhere('l.borrower_user_id', uid))
    .whereIn('l.status', ['pending', 'active'])
    .select(
      'l.*',
      'cd.name as card_name',
      'cd.rarity',
    )
    .orderBy('l.lend_id', 'desc');

  return { ok: true, rows, internalId: uid };
}

/**
 * Borrower early return (no refund of price).
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} lendId
 */
async function returnBorrowedCard(client, discordUser, lendId) {
  await client.db.checkUser(discordUser);
  const uid = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!uid) return { ok: false, error: 'Profile not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    const c = await trx('tcg_lend_contracts').where({ lend_id: lendId }).forUpdate().first();
    if (!c || c.status !== 'active') {
      result = { ok: false, error: 'No active loan with this id.' };
      return;
    }
    if (Number(c.borrower_user_id) !== uid) {
      result = { ok: false, error: 'Only the **borrower** can return the card this way.' };
      return;
    }
    await finalizeLoan(trx, c, 'completed');
    result = { ok: true, lendId };
  });
  return result;
}

/**
 * Recall Token — lender or borrower ends loan immediately.
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} lendId
 */
async function recallLendWithToken(client, discordUser, lendId) {
  await client.db.checkUser(discordUser);
  const uid = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!uid) return { ok: false, error: 'Profile not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    const c = await trx('tcg_lend_contracts').where({ lend_id: lendId }).forUpdate().first();
    if (!c || c.status !== 'active') {
      result = { ok: false, error: 'No active loan with this id.' };
      return;
    }
    if (Number(c.lender_user_id) !== uid && Number(c.borrower_user_id) !== uid) {
      result = { ok: false, error: 'Not a party to this loan.' };
      return;
    }
    await tcgEconomy.ensureWallet(uid, trx);
    const w = await trx('user_wallets').where({ user_id: uid }).forUpdate().first();
    const tok = Number(w.tcg_recall_token_charges) || 0;
    if (tok < 1) {
      result = { ok: false, error: 'Need a **Recall Token** (`/tcg store buy`).' };
      return;
    }
    await trx('user_wallets').where({ user_id: uid }).update({
      tcg_recall_token_charges: tok - 1,
      updated_at: nowUnix(),
    });
    await finalizeLoan(trx, c, 'recalled');
    result = { ok: true, lendId };
  });
  return result;
}

/**
 * @param {import('knex').Knex} trx
 * @param {number} borrowerInternalId
 * @param {number} mainUserCardId
 */
async function recordBorrowedBattleUse(trx, borrowerInternalId, mainUserCardId) {
  const inst = await trx('user_cards')
    .where({ user_card_id: mainUserCardId, user_id: borrowerInternalId })
    .first();
  if (!inst || !inst.lent_source_user_card_id) return;

  const src = Number(inst.lent_source_user_card_id);
  const c = await trx('tcg_lend_contracts')
    .where({ lender_card_id: src, status: 'active' })
    .forUpdate()
    .first();
  if (!c) return;

  const used = Number(c.battles_used) + 1;
  await trx('tcg_lend_contracts').where({ lend_id: c.lend_id }).update({ battles_used: used });

  const maxB = c.max_battles != null ? Number(c.max_battles) : null;
  if (maxB != null && used >= maxB) {
    await finalizeLoan(trx, c, 'completed');
  }
}

module.exports = {
  createLendOffer,
  acceptLendOffer,
  listMyLends,
  returnBorrowedCard,
  recallLendWithToken,
  expireDueLoans,
  recordBorrowedBattleUse,
  finalizeLoan,
};
