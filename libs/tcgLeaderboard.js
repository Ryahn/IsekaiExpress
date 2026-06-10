/**
 * Leaderboard queries for TCG PvP seasons and PvE clears.
 * [CardSystem.md § PvP Seasons & Rankings]
 */

const db = require('../database/db');
const { CURRENT_SEASON } = require('./tcgPvpRank');

const TOP_N = 20;

/** Medal emoji for position. */
function medal(i) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `**${i + 1}.**`;
}

/**
 * Top N players by RP in the current season.
 * @returns {Promise<Array<{ rank: number, username: string, rp: number, rank_tier: string }>>}
 */
async function topBySeasonRp() {
  const rows = await db
    .query('tcg_pvp_rank as r')
    .join('users as u', 'u.id', 'r.user_id')
    .where('r.season_key', CURRENT_SEASON)
    .orderBy('r.rp', 'desc')
    .limit(TOP_N)
    .select('u.username', 'r.rp', 'r.rank_tier');

  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/**
 * Top N players by all-time PvP wins (sum across all seasons).
 * @returns {Promise<Array<{ rank: number, username: string, total_wins: number }>>}
 */
async function topByAlltimeWins() {
  const rows = await db
    .query('tcg_pvp_rank as r')
    .join('users as u', 'u.id', 'r.user_id')
    .groupBy('r.user_id', 'u.username')
    .orderByRaw('SUM(r.season_wins) DESC')
    .limit(TOP_N)
    .select('u.username')
    .sum('r.season_wins as total_wins');

  return rows.map((r, i) => ({ rank: i + 1, username: r.username, total_wins: Number(r.total_wins) }));
}

/**
 * Top N players by PvE clears in a given region (highest tier cleared).
 * @param {number} region
 * @returns {Promise<Array<{ rank: number, username: string, region: number, highest_tier: number }>>}
 */
async function topByRegionClears(region) {
  const rows = await db
    .query('tcg_pve_progress as p')
    .join('users as u', 'u.id', 'p.user_id')
    .where('p.region', region)
    .orderBy('p.tier_reached', 'desc')
    .limit(TOP_N)
    .select('u.username', 'p.tier_reached');

  return rows.map((r, i) => ({ rank: i + 1, username: r.username, region, highest_tier: r.tier_reached }));
}

/**
 * Top N players by gold balance.
 * @returns {Promise<Array<{ rank: number, username: string, gold: number }>>}
 */
async function topByGold() {
  const rows = await db
    .query('user_wallets as w')
    .join('users as u', 'u.id', 'w.user_id')
    .orderBy('w.gold', 'desc')
    .limit(TOP_N)
    .select('u.username', 'w.gold');

  return rows.map((r, i) => ({ rank: i + 1, username: r.username, gold: Number(r.gold) }));
}

/**
 * Build a leaderboard embed fields array from a rows array.
 * @param {Array} rows
 * @param {function(row): string} lineFn
 * @returns {string} formatted text block
 */
function formatBoard(rows, lineFn) {
  if (!rows.length) return '_No data yet._';
  return rows.map((r, i) => `${medal(i)} ${lineFn(r)}`).join('\n');
}

module.exports = {
  topBySeasonRp,
  topByAlltimeWins,
  topByRegionClears,
  topByGold,
  formatBoard,
};
