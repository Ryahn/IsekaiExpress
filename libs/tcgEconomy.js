const db = require('../database/db');
const xpSystem = require('./xpSystem');

/** XP cost per 1 gold ([CardSystem.md] — one-way conversion). */
const XP_PER_GOLD_UNIT = 50;
const DAILY_LOGIN_XP = 100;
const DAILY_COOLDOWN_SEC = 24 * 60 * 60;
const BATTLE_XP_PVE = 25;
const BATTLE_XP_PVP = 40;
const FIRST_WIN_BONUS_XP = 75;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function utcDateString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function getInternalUserId(discordUserId) {
  const row = await db.query('users').where({ discord_id: String(discordUserId) }).first();
  return row ? row.id : null;
}

/**
 * @param {number} internalUserId users.id
 * @param {import('knex').Knex} [trx]
 */
async function ensureWallet(internalUserId, trx = db.query) {
  const ts = nowUnix();
  const existing = await trx('user_wallets').where({ user_id: internalUserId }).first();
  if (existing) return existing;
  try {
    await trx('user_wallets').insert({
      user_id: internalUserId,
      gold: 0,
      updated_at: ts,
    });
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw e;
  }
  return trx('user_wallets').where({ user_id: internalUserId }).first();
}

/**
 * @param {import('knex').Knex} q knex or transaction
 */
async function applyXpDeltaWithClient(q, discordUserId, deltaXp) {
  const row = await q('user_xp').where({ user_id: discordUserId }).first();
  if (!row) {
    const xp0 = Math.max(0, deltaXp);
    await q('user_xp').insert({
      user_id: discordUserId,
      xp: xp0,
      level: xpSystem.calculateLevel(xp0),
      message_count: 0,
    });
    return;
  }
  const newXp = Math.max(0, Number(row.xp) + deltaXp);
  const newLevel = xpSystem.calculateLevel(newXp);
  await q('user_xp').where({ user_id: discordUserId }).update({
    xp: newXp,
    level: newLevel,
  });
}

async function applyXpDelta(discordUserId, deltaXp) {
  await applyXpDeltaWithClient(db.query, discordUserId, deltaXp);
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} amount positive gold to add
 */
async function addGold(client, discordUser, amount) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'Invalid gold amount.' };
  }
  await client.db.checkUser(discordUser);
  const internalId = await getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };
  await ensureWallet(internalId);
  const ts = nowUnix();
  await db.query('user_wallets').where({ user_id: internalId }).increment('gold', n);
  await db.query('user_wallets').where({ user_id: internalId }).update({ updated_at: ts });
  const w = await db.query('user_wallets').where({ user_id: internalId }).first();
  return { ok: true, newGold: Number(w.gold) };
}

async function ensureProfileForTcg(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await getInternalUserId(discordUser.id);
  if (!internalId) throw new Error('User row missing after checkUser');
  const wallet = await ensureWallet(internalId);
  await client.db.getUserXP(discordUser.id);
  return { internalUserId: internalId, wallet };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function getTcgBalance(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await getInternalUserId(discordUser.id);
  if (!internalId) return null;
  const wallet = await ensureWallet(internalId);
  const xpRow = await client.db.getUserXP(discordUser.id);
  const now = nowUnix();
  const lastClaim = wallet.tcg_daily_claim_at != null ? Number(wallet.tcg_daily_claim_at) : null;
  let nextDailyAt = null;
  let dailyReady = true;
  if (lastClaim != null) {
    nextDailyAt = lastClaim + DAILY_COOLDOWN_SEC;
    if (now < nextDailyAt) dailyReady = false;
  }
  return {
    gold: Number(wallet.gold),
    xp: Number(xpRow.xp),
    level: Number(xpRow.level),
    dailyReady,
    nextDailyAt,
    dailyRemainingSec: dailyReady ? 0 : Math.max(0, (lastClaim + DAILY_COOLDOWN_SEC) - now),
  };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} xpAmount
 */
async function convertXpToGold(client, discordUser, xpAmount) {
  const discordUserId = String(discordUser.id);
  if (!Number.isFinite(xpAmount) || xpAmount < XP_PER_GOLD_UNIT) {
    return { ok: false, error: `Amount must be at least ${XP_PER_GOLD_UNIT} XP.` };
  }
  if (xpAmount % XP_PER_GOLD_UNIT !== 0) {
    return { ok: false, error: `XP must be a multiple of ${XP_PER_GOLD_UNIT}.` };
  }
  const goldGain = xpAmount / XP_PER_GOLD_UNIT;

  await client.db.checkUser(discordUser);
  const internalId = await getInternalUserId(discordUserId);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    await ensureWallet(internalId, trx);
    const xpRow = await trx('user_xp').where({ user_id: discordUserId }).forUpdate().first();
    if (!xpRow || Number(xpRow.xp) < xpAmount) {
      result = { ok: false, error: 'Not enough XP.' };
      return;
    }
    const walletRow = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
    const newXp = Number(xpRow.xp) - xpAmount;
    const newLevel = xpSystem.calculateLevel(newXp);
    const ts = nowUnix();
    await trx('user_xp').where({ user_id: discordUserId }).update({
      xp: newXp,
      level: newLevel,
    });
    const newGold = Number(walletRow.gold) + goldGain;
    await trx('user_wallets').where({ user_id: internalId }).update({
      gold: newGold,
      updated_at: ts,
    });
    result = {
      ok: true,
      goldGained: goldGain,
      newGold,
      newXp,
    };
  });
  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function claimTcgDaily(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };
  await ensureWallet(internalId);

  const discordId = String(discordUser.id);
  const now = nowUnix();
  let outcome;

  await db.query.transaction(async (trx) => {
    const updated = await trx('user_wallets')
      .where({ user_id: internalId })
      .andWhere(function addDailyGate() {
        this.whereNull('tcg_daily_claim_at').orWhereRaw('(? - tcg_daily_claim_at) >= ?', [now, DAILY_COOLDOWN_SEC]);
      })
      .update({ tcg_daily_claim_at: now, updated_at: now });

    if (!updated) {
      const w = await trx('user_wallets').where({ user_id: internalId }).first();
      const last = Number(w.tcg_daily_claim_at);
      const nextAt = last + DAILY_COOLDOWN_SEC;
      outcome = {
        ok: false,
        error: 'cooldown',
        nextClaimAt: nextAt,
        remainingSec: Math.max(0, nextAt - now),
      };
      return;
    }

    await applyXpDeltaWithClient(trx, discordId, DAILY_LOGIN_XP);
    outcome = { ok: true, xpGained: DAILY_LOGIN_XP };
  });

  return outcome;
}

/**
 * Call from PvE/PvP battle resolution when implemented. Grants base XP on win or loss;
 * on a win, applies first-win-of-day bonus (+75 XP) once per UTC calendar day.
 *
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {{ won: boolean, isPvp?: boolean }} opts
 */
async function awardTcgBattleXp(client, discordUser, opts) {
  const { won, isPvp = false } = opts;
  const discordId = String(discordUser.id);
  await client.db.checkUser(discordUser);
  const internalId = await getInternalUserId(discordId);
  if (!internalId) return { ok: false, error: 'User not found.' };
  await ensureWallet(internalId);
  await client.db.getUserXP(discordId);

  const baseXp = isPvp ? BATTLE_XP_PVP : BATTLE_XP_PVE;
  let firstWinBonus = 0;

  let summary;
  await db.query.transaction(async (trx) => {
    if (won) {
      const today = utcDateString();
      const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      if (w.tcg_first_win_utc_date !== today) {
        firstWinBonus = FIRST_WIN_BONUS_XP;
        await trx('user_wallets').where({ user_id: internalId }).update({
          tcg_first_win_utc_date: today,
          updated_at: nowUnix(),
        });
      }
    }
    const total = baseXp + firstWinBonus;
    await applyXpDeltaWithClient(trx, discordId, total);
    summary = { ok: true, baseXp, firstWinBonus, totalXp: total };
  });
  return summary;
}

module.exports = {
  XP_PER_GOLD_UNIT,
  DAILY_LOGIN_XP,
  DAILY_COOLDOWN_SEC,
  BATTLE_XP_PVE,
  BATTLE_XP_PVP,
  FIRST_WIN_BONUS_XP,
  getTcgBalance,
  convertXpToGold,
  claimTcgDaily,
  awardTcgBattleXp,
  ensureProfileForTcg,
  getInternalUserId,
  ensureWallet,
  addGold,
};
