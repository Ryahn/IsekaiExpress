const db = require('../database/db');

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Block loadout changes while user has an active PvP challenge or pick window.
 * @param {number} internalUserId users.id
 */
async function loadoutChangeBlockedReason(internalUserId) {
  const uid = Number(internalUserId);
  if (!uid) return null;

  const now = nowUnix();
  const pvp = await db
    .query('tcg_pvp_sessions')
    .where((q) => q.where('challenger_user_id', uid).orWhere('target_user_id', uid))
    .whereIn('status', ['pending_accept', 'awaiting_picks'])
    .andWhereRaw('(status = ? and accept_deadline > ?) or (status = ? and pick_deadline > ?)', [
      'pending_accept',
      now,
      'awaiting_picks',
      now,
    ])
    .first();
  if (pvp) {
    return 'You have an **active PvP challenge or pick window** — finish or let it expire before changing loadout.';
  }

  return null;
}

/** @param {number} internalUserId @param {number} userCardId */
async function isUserCardOnActiveExpedition(internalUserId, userCardId) {
  const row = await db
    .query('tcg_expeditions')
    .where({
      user_id: Number(internalUserId),
      user_card_id: Number(userCardId),
      claimed: false,
    })
    .first();
  return Boolean(row);
}

module.exports = {
  loadoutChangeBlockedReason,
  isUserCardOnActiveExpedition,
};
