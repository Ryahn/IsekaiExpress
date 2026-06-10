/**
 * PvP rank / RP system ([CardSystem.md § PvP Seasons & Rankings]).
 *
 * Rank tiers: Bronze → Silver → Gold → Platinum → Diamond → Champion
 * Champion = top 50 server-wide by RP.
 */

const db = require('../database/db');
const { rarityRank, sanitizeRarityAbbrev } = require('../src/bot/tcg/rarityOrder');
// Soft boost applied at RP award time — imported lazily to avoid circular dep
let _tcgSeasonEnd = null;
function getSeasonEnd() {
  if (!_tcgSeasonEnd) _tcgSeasonEnd = require('./tcgSeasonEnd');
  return _tcgSeasonEnd;
}

const RANK_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion'];
const RANK_INDEX = Object.fromEntries(RANK_TIERS.map((r, i) => [r, i]));

/** Gold wager cap and max card rarity wager per rank tier ([CardSystem.md]). */
const WAGER_CAPS = {
  Bronze:   { gold: 500,    rarityMaxRank: rarityRank(sanitizeRarityAbbrev('UC', 'C')) },
  Silver:   { gold: 1500,   rarityMaxRank: rarityRank(sanitizeRarityAbbrev('R', 'C')) },
  Gold:     { gold: 4000,   rarityMaxRank: rarityRank(sanitizeRarityAbbrev('U', 'C')) },
  Platinum: { gold: 10000,  rarityMaxRank: rarityRank(sanitizeRarityAbbrev('L', 'C')) },
  Diamond:  { gold: 25000,  rarityMaxRank: rarityRank(sanitizeRarityAbbrev('M', 'C')) },
  Champion: { gold: Infinity, rarityMaxRank: rarityRank(sanitizeRarityAbbrev('M', 'C')) },
};

/** Current season key. Override with TCG_PVP_SEASON env var. */
const CURRENT_SEASON = process.env.TCG_PVP_SEASON || 'default';

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get or create rank row for a user.
 * @param {number} internalId
 * @param {object} [trx]
 */
async function ensureRankRow(internalId, trx) {
  const q = trx || db.query;
  let row = await q('tcg_pvp_rank').where({ user_id: internalId }).first();
  if (row) return row;
  try {
    await q('tcg_pvp_rank').insert({
      user_id: internalId,
      rp: 0,
      rank_tier: 'Bronze',
      season_wins: 0,
      season_losses: 0,
      season_key: CURRENT_SEASON,
      updated_at: nowUnix(),
    });
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw e;
  }
  row = await q('tcg_pvp_rank').where({ user_id: internalId }).first();
  return row;
}

/**
 * Recalculate rank tier from RP (not Champion — that is assigned by trim job).
 * @param {number} rp
 * @returns {string}
 */
function rankTierFromRp(rp) {
  if (rp >= 2400) return 'Diamond';
  if (rp >= 1600) return 'Platinum';
  if (rp >= 900)  return 'Gold';
  if (rp >= 400)  return 'Silver';
  return 'Bronze';
}

/**
 * RP delta for a match win/loss.
 * Base: +25 win / −20 loss.
 * Wager bonus: +1 per 100g wagered (capped at +10).
 * Rank difference: beating a higher rank adds +10 per tier above.
 * @param {{ won: boolean, potGold: number, winnerId: number, loserId: number }} opts
 * @param {{ rank_tier: string }} winnerRank
 * @param {{ rank_tier: string }} loserRank
 * @returns {{ winnerDelta: number, loserDelta: number }}
 */
function computeRpDelta(opts, winnerRank, loserRank) {
  const { potGold = 0 } = opts;
  const wagerBonus = Math.min(10, Math.floor(potGold / 100));

  const wRankIdx = RANK_INDEX[winnerRank.rank_tier] ?? 0;
  const lRankIdx = RANK_INDEX[loserRank.rank_tier] ?? 0;
  const rankDiff = Math.max(0, lRankIdx - wRankIdx); // bonus when winner is lower rank

  const winnerDelta = 25 + wagerBonus + rankDiff * 10;
  const loserDelta = -(20 + wagerBonus);

  return { winnerDelta, loserDelta };
}

/**
 * Apply RP changes after a resolved match. Runs inside caller's transaction.
 * @param {object} trx - knex transaction
 * @param {number} winnerId - internal user id
 * @param {number} loserId - internal user id
 * @param {number} potGold
 * @returns {Promise<{ winnerRpAfter: number, loserRpAfter: number, winnerTier: string, loserTier: string, winnerDelta: number, loserDelta: number }>}
 */
async function applyMatchRp(trx, winnerId, loserId, potGold) {
  const [wRow, lRow] = await Promise.all([
    ensureRankRow(winnerId, trx),
    ensureRankRow(loserId, trx),
  ]);

  let { winnerDelta, loserDelta } = computeRpDelta({ potGold }, wRow, lRow);

  // Apply soft season boost if active (first 2 weeks of season)
  const seasonEnd = getSeasonEnd();
  const activeSeason = await seasonEnd.getActiveSeason();
  winnerDelta = seasonEnd.applySoftBoost(winnerDelta, activeSeason);

  const winnerRpAfter = Math.max(0, (Number(wRow.rp) || 0) + winnerDelta);
  const loserRpAfter  = Math.max(0, (Number(lRow.rp) || 0) + loserDelta);

  // Recalculate tier (Champion is set externally by trim job, not here)
  const winnerTier = wRow.rank_tier === 'Champion' ? 'Champion' : rankTierFromRp(winnerRpAfter);
  const loserTier  = lRow.rank_tier === 'Champion' ? rankTierFromRp(loserRpAfter) : rankTierFromRp(loserRpAfter);

  const now = nowUnix();
  await trx('tcg_pvp_rank')
    .where({ user_id: winnerId })
    .update({
      rp: winnerRpAfter,
      rank_tier: winnerTier,
      season_wins: Number(wRow.season_wins) + 1,
      season_key: CURRENT_SEASON,
      updated_at: now,
    });
  await trx('tcg_pvp_rank')
    .where({ user_id: loserId })
    .update({
      rp: loserRpAfter,
      rank_tier: loserTier,
      season_losses: Number(lRow.season_losses) + 1,
      season_key: CURRENT_SEASON,
      updated_at: now,
    });

  return { winnerRpAfter, loserRpAfter, winnerTier, loserTier, winnerDelta, loserDelta };
}

/**
 * Get the rank row for display (rank, rp, wins, losses).
 * @param {number} internalId
 */
async function getRankRow(internalId) {
  return ensureRankRow(internalId);
}

/**
 * Validate wager amounts against the challenger's rank caps.
 * @param {string} rankTier
 * @param {number} goldWager
 * @param {string|null} cardRarity - rarity abbreviation of the wagered card (null if no card wager)
 * @returns {{ ok: boolean, error?: string }}
 */
function validateWagerCaps(rankTier, goldWager, cardRarity) {
  const cap = WAGER_CAPS[rankTier] || WAGER_CAPS.Bronze;
  if (goldWager > cap.gold) {
    return {
      ok: false,
      error: `Your rank (**${rankTier}**) limits gold wagers to **${cap.gold}**g.`,
    };
  }
  if (cardRarity) {
    const cardRank = rarityRank(sanitizeRarityAbbrev(cardRarity, 'C'));
    if (cardRank > cap.rarityMaxRank) {
      const maxAbbrev = Object.entries(WAGER_CAPS).find(([, v]) => v.rarityMaxRank === cap.rarityMaxRank)?.[0] ?? rankTier;
      return {
        ok: false,
        error: `Your rank (**${rankTier}**) limits card wagers to **${maxAbbrev}** rarity or lower.`,
      };
    }
  }
  return { ok: true };
}

module.exports = {
  RANK_TIERS,
  WAGER_CAPS,
  CURRENT_SEASON,
  ensureRankRow,
  rankTierFromRp,
  computeRpDelta,
  applyMatchRp,
  getRankRow,
  validateWagerCaps,
};
