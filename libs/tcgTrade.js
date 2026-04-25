const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');
const tcgLoadout = require('./tcgLoadout');
const tcgSetProgress = require('./tcgSetProgress');

const TRADE_EXPIRE_SEC = 24 * 60 * 60;
const MAX_OPEN_TRADES_PER_USER = 3;
const TRADE_GOLD_TAX_MULT = 0.97;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function outgoingGoldAfterTax(amount, taxExempt) {
  const n = Math.floor(Number(amount)) || 0;
  if (n <= 0) return 0;
  if (taxExempt) return n;
  return Math.floor(n * TRADE_GOLD_TAX_MULT);
}

async function expireStalePendingTrades(trx) {
  const now = nowUnix();
  await trx('tcg_trade_offers')
    .where({ status: 'pending' })
    .where('expires_at', '<', now)
    .update({ status: 'expired' });
}

async function countOpenTradesForUser(trx, internalUserId) {
  const now = nowUnix();
  const row = await trx('tcg_trade_offers')
    .where({ status: 'pending' })
    .where('expires_at', '>', now)
    .where((q) =>
      q.where('proposer_user_id', internalUserId).orWhere('counterparty_user_id', internalUserId),
    )
    .count('* as c')
    .first();
  return Number(row ? row.c : 0);
}

function instanceUsableForTrade(row) {
  if (!row) return { ok: false, error: 'Copy not found.' };
  if (row.is_lent || row.is_escrowed) {
    return { ok: false, error: 'Lent or escrowed copies cannot be traded.' };
  }
  if (Number(row.tcg_preservation_sealed)) {
    return { ok: false, error: 'Preservation Sealed cards cannot be traded.' };
  }
  if (row.lent_source_user_card_id) {
    return { ok: false, error: 'Borrowed copies cannot be traded.' };
  }
  return { ok: true };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} proposerDiscord
 * @param {{ id: string, username: string }} counterpartyDiscord
 * @param {number} proposerGiveInstanceId copy you offer
 * @param {number} counterpartyGiveInstanceId copy you want from them
 * @param {{ proposerGold?: number, counterpartyGold?: number, useTradeLicense?: boolean }} [opts]
 */
async function createTradeOffer(
  client,
  proposerDiscord,
  counterpartyDiscord,
  proposerGiveInstanceId,
  counterpartyGiveInstanceId,
  opts = {},
) {
  const proposerGold = Math.max(0, Math.floor(Number(opts.proposerGold) || 0));
  const counterpartyGold = Math.max(0, Math.floor(Number(opts.counterpartyGold) || 0));
  const useTradeLicense = !!opts.useTradeLicense;

  if (String(proposerDiscord.id) === String(counterpartyDiscord.id)) {
    return { ok: false, error: 'You cannot trade with yourself.' };
  }
  if (Number(proposerGiveInstanceId) === Number(counterpartyGiveInstanceId)) {
    return { ok: false, error: 'Use two different copy IDs.' };
  }
  if (useTradeLicense && proposerGold + counterpartyGold === 0) {
    return { ok: false, error: 'Trade License only applies when **gold** is part of the deal.' };
  }

  await client.db.checkUser(proposerDiscord);
  await client.db.checkUser(counterpartyDiscord);

  const proposerId = await tcgEconomy.getInternalUserId(proposerDiscord.id);
  const counterId = await tcgEconomy.getInternalUserId(counterpartyDiscord.id);
  if (!proposerId || !counterId) {
    return { ok: false, error: 'Both users need bot profiles (`checkUser`).' };
  }

  let result;
  try {
    await db.query.transaction(async (trx) => {
      await expireStalePendingTrades(trx);

      const mine = await trx('user_cards')
        .where({ user_card_id: proposerGiveInstanceId, user_id: proposerId })
        .forUpdate()
        .first();
      const theirs = await trx('user_cards')
        .where({ user_card_id: counterpartyGiveInstanceId, user_id: counterId })
        .forUpdate()
        .first();

      const c1 = instanceUsableForTrade(mine);
      if (!c1.ok) {
        result = c1;
        throw new Error('TRADE_ABORT');
      }
      const c2 = instanceUsableForTrade(theirs);
      if (!c2.ok) {
        result = { ok: false, error: 'Their copy is not available for trade (missing, lent, sealed, or borrowed).' };
        throw new Error('TRADE_ABORT');
      }

      let taxExempt = false;
      if (proposerGold + counterpartyGold > 0) {
        await tcgEconomy.ensureWallet(proposerId, trx);
        const wProp = await trx('user_wallets').where({ user_id: proposerId }).forUpdate().first();
        const lic = Number(wProp.tcg_trade_license_charges) || 0;
        if (useTradeLicense) {
          if (lic < 1) {
            result = { ok: false, error: 'You need a **Trade License** charge (`/tcg shop`).' };
            throw new Error('TRADE_ABORT');
          }
          taxExempt = true;
          await trx('user_wallets').where({ user_id: proposerId }).update({
            tcg_trade_license_charges: lic - 1,
            updated_at: nowUnix(),
          });
        }
      }

      const openP = await countOpenTradesForUser(trx, proposerId);
      const openC = await countOpenTradesForUser(trx, counterId);
      if (openP >= MAX_OPEN_TRADES_PER_USER) {
        result = {
          ok: false,
          error: `You already have **${MAX_OPEN_TRADES_PER_USER}** open trade offers (max).`,
        };
        throw new Error('TRADE_ABORT');
      }
      if (openC >= MAX_OPEN_TRADES_PER_USER) {
        result = {
          ok: false,
          error: `They already have **${MAX_OPEN_TRADES_PER_USER}** open trade offers (max).`,
        };
        throw new Error('TRADE_ABORT');
      }

      const ts = nowUnix();
      const ins = await trx('tcg_trade_offers').insert({
        proposer_user_id: proposerId,
        counterparty_user_id: counterId,
        proposer_instance_id: proposerGiveInstanceId,
        counterparty_instance_id: counterpartyGiveInstanceId,
        proposer_gold: proposerGold,
        counterparty_gold: counterpartyGold,
        tax_exempt: taxExempt,
        status: 'pending',
        created_at: ts,
        expires_at: ts + TRADE_EXPIRE_SEC,
      });
      const tid = Array.isArray(ins) ? ins[0] : ins;

      result = {
        ok: true,
        tradeId: Number(tid),
        expiresAt: ts + TRADE_EXPIRE_SEC,
        taxExempt,
        proposerGold,
        counterpartyGold,
      };
    });
  } catch (e) {
    if (e.message === 'TRADE_ABORT' && result) return result;
    throw e;
  }

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} accepterDiscord must be counterparty
 * @param {number} tradeId
 */
async function acceptTradeOffer(client, accepterDiscord, tradeId) {
  await client.db.checkUser(accepterDiscord);
  const accepterId = await tcgEconomy.getInternalUserId(accepterDiscord.id);
  if (!accepterId) return { ok: false, error: 'Profile not found.' };

  let result;
  try {
    await db.query.transaction(async (trx) => {
      await expireStalePendingTrades(trx);

      const t = await trx('tcg_trade_offers').where({ trade_id: tradeId }).forUpdate().first();
      if (!t) {
        result = { ok: false, error: 'Trade not found.' };
        throw new Error('TRADE_ABORT');
      }
      if (t.status !== 'pending') {
        result = { ok: false, error: `This trade is no longer pending (**${t.status}**).` };
        throw new Error('TRADE_ABORT');
      }
      if (Number(t.counterparty_user_id) !== accepterId) {
        result = { ok: false, error: 'Only the **counterparty** can accept this trade.' };
        throw new Error('TRADE_ABORT');
      }
      const now = nowUnix();
      if (Number(t.expires_at) < now) {
        await trx('tcg_trade_offers').where({ trade_id: tradeId }).update({ status: 'expired' });
        result = { ok: false, error: 'This trade offer has **expired**.' };
        throw new Error('TRADE_ABORT');
      }

      const proposerId = Number(t.proposer_user_id);
      const propInst = Number(t.proposer_instance_id);
      const ctrInst = Number(t.counterparty_instance_id);
      const proposerGold = Math.floor(Number(t.proposer_gold) || 0);
      const counterpartyGold = Math.floor(Number(t.counterparty_gold) || 0);
      const taxExempt = !!Number(t.tax_exempt);

      const mine = await trx('user_cards')
        .where({ user_card_id: propInst, user_id: proposerId })
        .forUpdate()
        .first();
      const theirs = await trx('user_cards')
        .where({ user_card_id: ctrInst, user_id: accepterId })
        .forUpdate()
        .first();

      const c1 = instanceUsableForTrade(mine);
      if (!c1.ok) {
        result = { ok: false, error: 'Proposer no longer has their copy available.' };
        throw new Error('TRADE_ABORT');
      }
      const c2 = instanceUsableForTrade(theirs);
      if (!c2.ok) {
        result = { ok: false, error: 'You no longer have your offered copy available.' };
        throw new Error('TRADE_ABORT');
      }

      if (proposerGold > 0 || counterpartyGold > 0) {
        await tcgEconomy.ensureWallet(proposerId, trx);
        await tcgEconomy.ensureWallet(accepterId, trx);
        const wP = await trx('user_wallets').where({ user_id: proposerId }).forUpdate().first();
        const wC = await trx('user_wallets').where({ user_id: accepterId }).forUpdate().first();
        if (Number(wP.gold) < proposerGold) {
          result = { ok: false, error: 'Proposer no longer has enough **gold** for this trade.' };
          throw new Error('TRADE_ABORT');
        }
        if (Number(wC.gold) < counterpartyGold) {
          result = { ok: false, error: 'You do not have enough **gold** for this trade.' };
          throw new Error('TRADE_ABORT');
        }

        const recvCtr = outgoingGoldAfterTax(proposerGold, taxExempt);
        const recvProp = outgoingGoldAfterTax(counterpartyGold, taxExempt);
        const newGoldP = Number(wP.gold) - proposerGold + recvProp;
        const newGoldC = Number(wC.gold) - counterpartyGold + recvCtr;
        const ts = nowUnix();
        await trx('user_wallets').where({ user_id: proposerId }).update({ gold: newGoldP, updated_at: ts });
        await trx('user_wallets').where({ user_id: accepterId }).update({ gold: newGoldC, updated_at: ts });
      }

      await tcgLoadout.clearLoadoutSlotsReferencingInstance(trx, proposerId, propInst);
      await tcgLoadout.clearLoadoutSlotsReferencingInstance(trx, accepterId, ctrInst);

      await trx('user_cards').where({ user_card_id: propInst }).update({ user_id: accepterId });
      await trx('user_cards').where({ user_card_id: ctrInst }).update({ user_id: proposerId });

      await tcgSetProgress.syncTitleUnlocks(trx, proposerId);
      await tcgSetProgress.syncTitleUnlocks(trx, accepterId);

      await trx('tcg_trade_offers').where({ trade_id: tradeId }).update({ status: 'accepted' });

      result = { ok: true, tradeId };
    });
  } catch (e) {
    if (e.message === 'TRADE_ABORT' && result) return result;
    throw e;
  }

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} tradeId
 */
async function cancelTradeOffer(client, discordUser, tradeId) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'Profile not found.' };

  let result = { ok: false, error: 'Could not cancel trade.' };
  await db.query.transaction(async (trx) => {
    await expireStalePendingTrades(trx);
    const t = await trx('tcg_trade_offers').where({ trade_id: tradeId }).forUpdate().first();
    if (!t) {
      result = { ok: false, error: 'Trade not found.' };
      return;
    }
    if (t.status !== 'pending') {
      result = { ok: false, error: `Not pending (**${t.status}**).` };
      return;
    }
    if (Number(t.proposer_user_id) !== internalId && Number(t.counterparty_user_id) !== internalId) {
      result = { ok: false, error: 'Not your trade.' };
      return;
    }
    await trx('tcg_trade_offers').where({ trade_id: tradeId }).update({ status: 'cancelled' });
    result = { ok: true, tradeId };
  });

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function listMyTradeOffers(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'Profile not found.', rows: [] };

  await expireStalePendingTrades(db.query);

  const now = nowUnix();
  const rows = await db
    .query('tcg_trade_offers as o')
    .join('user_cards as pc', 'o.proposer_instance_id', 'pc.user_card_id')
    .join('card_data as pt', 'pc.card_id', 'pt.card_id')
    .join('user_cards as cc', 'o.counterparty_instance_id', 'cc.user_card_id')
    .join('card_data as ct', 'cc.card_id', 'ct.card_id')
    .where('o.status', 'pending')
    .where('o.expires_at', '>', now)
    .where((q) =>
      q.where('o.proposer_user_id', internalId).orWhere('o.counterparty_user_id', internalId),
    )
    .select(
      'o.trade_id',
      'o.proposer_user_id',
      'o.counterparty_user_id',
      'o.expires_at as expires_at',
      'o.proposer_gold',
      'o.counterparty_gold',
      'o.tax_exempt',
      'pt.name as proposer_card_name',
      'pt.rarity as proposer_rarity',
      'ct.name as counterparty_card_name',
      'ct.rarity as counterparty_rarity',
    )
    .orderBy('o.trade_id', 'desc');

  return { ok: true, rows, internalId };
}

module.exports = {
  TRADE_EXPIRE_SEC,
  MAX_OPEN_TRADES_PER_USER,
  TRADE_GOLD_TAX_MULT,
  createTradeOffer,
  acceptTradeOffer,
  cancelTradeOffer,
  listMyTradeOffers,
};
