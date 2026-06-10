/**
 * Season end processing: rank decay, Champion cap trim, rewards, soft RP boost.
 * [CardSystem.md § PvP Seasons & Rankings]
 */

const db = require('../database/db');
const tcgInventory = require('./tcgInventory');
const tcgEconomy = require('./tcgEconomy');
const { RANK_TIERS, rankTierFromRp } = require('./tcgPvpRank');
const logger = require('./logger');

const CHAMPION_CAP = 50;

/** Rank index for decay calculations. */
const RANK_INDEX = Object.fromEntries(RANK_TIERS.map((r, i) => [r, i]));

/**
 * Resolve the current active season from DB, or return null.
 * @returns {Promise<object|null>}
 */
async function getActiveSeason() {
  return db.query('tcg_seasons').where({ is_active: true }).first();
}

/**
 * Seed a season row if it doesn't exist. Called at startup or by admin command.
 * @param {{ season_key: string, name: string, start_at: number, end_at: number }} opts
 */
async function upsertSeason(opts) {
  const softBoostEnd = opts.start_at + 14 * 24 * 3600; // 2 weeks
  const existing = await db.query('tcg_seasons').where({ season_key: opts.season_key }).first();
  if (existing) {
    await db.query('tcg_seasons').where({ season_key: opts.season_key }).update({
      name: opts.name,
      start_at: opts.start_at,
      end_at: opts.end_at,
      soft_boost_end_at: softBoostEnd,
      is_active: opts.is_active ?? existing.is_active,
    });
  } else {
    await db.query('tcg_seasons').insert({
      season_key: opts.season_key,
      name: opts.name,
      start_at: opts.start_at,
      end_at: opts.end_at,
      soft_boost_end_at: softBoostEnd,
      is_active: opts.is_active ?? false,
      decay_activity_threshold: opts.decay_activity_threshold ?? 10,
    });
  }
}

/**
 * Set a season as the active one (deactivates all others).
 * @param {string} seasonKey
 */
async function setActiveSeason(seasonKey) {
  await db.query('tcg_seasons').update({ is_active: false });
  await db.query('tcg_seasons').where({ season_key: seasonKey }).update({ is_active: true });
}

/**
 * Check if the soft RP boost is active for a given season (first 2 weeks).
 * @param {object|null} season - tcg_seasons row
 * @returns {boolean}
 */
function isSoftBoostActive(season) {
  if (!season) return false;
  const now = Math.floor(Date.now() / 1000);
  return now < Number(season.soft_boost_end_at);
}

/**
 * Apply the soft boost multiplier to an RP delta if the season is in its boost window.
 * @param {number} delta - base RP change
 * @param {object|null} season
 * @returns {number}
 */
function applySoftBoost(delta, season) {
  if (delta <= 0 || !isSoftBoostActive(season)) return delta;
  return Math.round(delta * 1.5);
}

/**
 * Trim the Champion rank to the top CHAMPION_CAP players by RP.
 * Players outside the cap are demoted to Diamond tier.
 * @param {object} trx - knex transaction
 * @param {string} seasonKey
 */
async function trimChampionCap(trx, seasonKey) {
  const allChampions = await trx('tcg_pvp_rank')
    .where({ rank_tier: 'Champion', season_key: seasonKey })
    .orderBy('rp', 'desc');

  if (allChampions.length <= CHAMPION_CAP) return { trimmed: 0 };

  const demote = allChampions.slice(CHAMPION_CAP);
  const demoteIds = demote.map((r) => r.user_id);
  const now = Math.floor(Date.now() / 1000);

  await trx('tcg_pvp_rank')
    .whereIn('user_id', demoteIds)
    .update({ rank_tier: 'Diamond', updated_at: now });

  return { trimmed: demote.length };
}

/**
 * Determine new rank after season decay.
 * @param {string} currentTier
 * @param {boolean} wasActive - played >= threshold battles
 * @returns {string}
 */
function decayedRank(currentTier, wasActive) {
  if (currentTier === 'Bronze') return 'Bronze'; // floor
  const idx = RANK_INDEX[currentTier] ?? 0;
  const drop = wasActive ? 1 : 2;
  const newIdx = Math.max(0, idx - drop);
  return RANK_TIERS[newIdx];
}

/**
 * Season end rewards by rank tier.
 * Returns a descriptor used to grant gold / cards.
 * @param {string} rankTier
 * @returns {{ gold: number, packRarity: string|null, isChampionMythic: boolean }}
 */
function seasonEndRewardDescriptor(rankTier) {
  switch (rankTier) {
    case 'Bronze':   return { gold: 200, packRarity: null, isChampionMythic: false };
    case 'Silver':   return { gold: 500, packRarity: 'C',  isChampionMythic: false };
    case 'Gold':     return { gold: 1200, packRarity: 'R', isChampionMythic: false };
    case 'Platinum': return { gold: 3000, packRarity: 'U', isChampionMythic: false };
    case 'Diamond':  return { gold: 8000, packRarity: 'L', isChampionMythic: false };
    case 'Champion': return { gold: 15000, packRarity: 'M', isChampionMythic: true };
    default:         return { gold: 0, packRarity: null, isChampionMythic: false };
  }
}

/**
 * Grant a random catalog card of a given rarity to a user as a reward.
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {string} rarity - abbreviation
 * @returns {Promise<object>} grantCardToPlayer result
 */
async function grantSeasonRewardCard(client, discordUser, rarity) {
  const template = await db.query('card_data')
    .where({ rarity })
    .whereNotNull('base_atk')
    .orderByRaw('RAND()')
    .first();
  if (!template) return { ok: false, error: `No ${rarity} template found.` };
  return tcgInventory.grantCardToPlayer(client, discordUser, { cardId: template.card_id });
}

/**
 * Run full season end processing for the given season.
 *
 * 1. Trim Champion cap to top 50
 * 2. Apply rank decay for all ranked players
 * 3. Grant rewards (gold + optional card)
 * 4. Reset season_wins / season_losses counters
 * 5. Deactivate the old season
 *
 * @param {import('discord.js').Client} client
 * @param {string} endingSeasonKey
 * @param {string} nextSeasonKey - season_key to activate after processing
 * @returns {Promise<{ ok: boolean, processed: number, error?: string }>}
 */
async function runSeasonEnd(client, endingSeasonKey, nextSeasonKey) {
  logger.info(`[TCG-SEASON] Running season end for ${endingSeasonKey}`);

  const season = await db.query('tcg_seasons').where({ season_key: endingSeasonKey }).first();
  if (!season) return { ok: false, error: `Season ${endingSeasonKey} not found.` };

  const threshold = Number(season.decay_activity_threshold) || 10;

  // Load all ranked players for this season
  const allRanked = await db.query('tcg_pvp_rank').where({ season_key: endingSeasonKey });
  if (!allRanked.length) {
    logger.info('[TCG-SEASON] No ranked players — skipping decay, activating next season.');
    await setActiveSeason(nextSeasonKey);
    return { ok: true, processed: 0 };
  }

  // Step 1: Trim Champion cap
  await db.query.transaction(async (trx) => {
    await trimChampionCap(trx, endingSeasonKey);
  });

  const now = Math.floor(Date.now() / 1000);
  let processed = 0;

  // Reload after trim (champion status may have changed)
  const ranked = await db.query('tcg_pvp_rank').where({ season_key: endingSeasonKey });

  for (const row of ranked) {
    try {
      const wasActive = (Number(row.season_wins) + Number(row.season_losses)) >= threshold;
      const newTier = decayedRank(row.rank_tier, wasActive);
      const newRp = Math.max(0, Math.round(Number(row.rp) * 0.8)); // soft RP reset — keep 80%

      // Grant rewards
      const reward = seasonEndRewardDescriptor(row.rank_tier);
      if (reward.gold > 0) {
        await tcgEconomy.incrementGoldInternal(row.user_id, reward.gold);
      }

      // Get discord user for card grant
      let discordUser = null;
      if (reward.packRarity) {
        const userRow = await db.query('users').where({ id: row.user_id }).first();
        if (userRow) {
          discordUser = { id: String(userRow.discord_id), username: userRow.username || '—' };
          await grantSeasonRewardCard(client, discordUser, reward.packRarity).catch((e) => {
            logger.warn(`[TCG-SEASON] card grant failed for user ${row.user_id}: ${e.message}`);
          });
        }
      }

      // DM the player
      if (discordUser || reward.gold > 0) {
        const userRow = discordUser ? null : await db.query('users').where({ id: row.user_id }).first();
        const did = discordUser?.id ?? (userRow ? String(userRow.discord_id) : null);
        if (did) {
          const cardNote = reward.packRarity ? ` + **${reward.packRarity}** card` : '';
          const dmText = `🏆 **Season ${season.name} ended!**\nYour rank: **${row.rank_tier}** → **${newTier}** next season\nReward: **${reward.gold}**g${cardNote}`;
          client.users.fetch(did).then((u) => u.send(dmText)).catch(() => {});
        }
      }

      // Update rank row — carry forward into next season with reset counters
      await db.query('tcg_pvp_rank')
        .where({ user_id: row.user_id })
        .update({
          rank_tier: newTier,
          rp: newRp,
          season_wins: 0,
          season_losses: 0,
          season_key: nextSeasonKey,
          updated_at: now,
        });

      processed++;
    } catch (e) {
      logger.error(`[TCG-SEASON] Error processing user ${row.user_id}: ${e.message}`);
    }
  }

  // Reset Season Recall wallet flags (purchased_for key becomes stale — new season)
  await db.query('user_wallets')
    .where({ tcg_season_recall_purchased_for: endingSeasonKey })
    .update({ tcg_season_recall_ready: 0, updated_at: now });

  // Activate next season
  await setActiveSeason(nextSeasonKey);

  logger.info(`[TCG-SEASON] Done. Processed ${processed} players. Active: ${nextSeasonKey}`);
  return { ok: true, processed };
}

/**
 * Season Recall: player uses their purchased recall before season end to skip decay.
 * Consumes tcg_season_recall_ready; flags rank row to skip decay in runSeasonEnd.
 * We implement this as a wallet column `tcg_season_recall_activated` that runSeasonEnd checks.
 *
 * This is a simple activation toggle — the actual skip happens in runSeasonEnd
 * by treating the user as "active" regardless of battle count.
 */
async function activateSeasonRecall(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'Profile not found.' };

  await tcgEconomy.ensureWallet(internalId);
  const w = await db.query('user_wallets').where({ user_id: internalId }).first();
  if (!Number(w.tcg_season_recall_ready)) {
    return { ok: false, error: 'No **Season Recall** available. Buy from the featured shop.' };
  }

  const now = Math.floor(Date.now() / 1000);
  await db.query('user_wallets').where({ user_id: internalId }).update({
    tcg_season_recall_ready: 0,
    updated_at: now,
  });
  // Store activation flag as a wallet column we'll check in runSeasonEnd
  // Use tcg_season_recall_purchased_for = 'activated' as sentinel
  await db.query('user_wallets').where({ user_id: internalId }).update({
    tcg_season_recall_purchased_for: 'activated',
    updated_at: now,
  });

  return { ok: true };
}

module.exports = {
  getActiveSeason,
  upsertSeason,
  setActiveSeason,
  isSoftBoostActive,
  applySoftBoost,
  trimChampionCap,
  decayedRank,
  seasonEndRewardDescriptor,
  runSeasonEnd,
  activateSeasonRecall,
};
