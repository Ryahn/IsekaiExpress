/**
 * Per-member set progression (same `card_data.discord_id`): 2/6–6/6 bonuses [CardSystem.md].
 */

/** @param {number} distinctRarityCount — [CardSystem.md] 2/6: +2% battle gold */
function battleGoldMultiplier(distinctRarityCount) {
  return distinctRarityCount >= 2 ? 1.02 : 1;
}

/** @param {number} distinctRarityCount */
function breakdownMultiplier(distinctRarityCount) {
  return distinctRarityCount >= 4 ? 1.05 : 1;
}

/**
 * +1 inventory cap per member where the player owns copies in at least five distinct rarities.
 * @param {import('knex').Knex} trx
 * @param {number} internalUserId
 */
async function totalSetBonusInventorySlots(trx, internalUserId) {
  const rows = await trx('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .where('user_cards.user_id', internalUserId)
    .whereNotNull('card_data.discord_id')
    .groupBy('card_data.discord_id')
    .select(trx.raw('COUNT(DISTINCT card_data.rarity) as c'));
  let n = 0;
  for (const r of rows) {
    if (Number(r.c) >= 5) n += 1;
  }
  return n;
}

/**
 * @param {import('knex').Knex} trx
 * @param {number} internalUserId
 * @param {{ tcg_inventory_bonus_slots?: number|null }|null|undefined} walletRow
 * @param {number} [baseCap=500]
 */
async function resolveInventoryCap(trx, internalUserId, walletRow, baseCap = 500) {
  const shopBonus = walletRow != null ? Number(walletRow.tcg_inventory_bonus_slots) || 0 : 0;
  const setSlots = await totalSetBonusInventorySlots(trx, internalUserId);
  return baseCap + shopBonus + setSlots;
}

module.exports = {
  battleGoldMultiplier,
  breakdownMultiplier,
  totalSetBonusInventorySlots,
  resolveInventoryCap,
};
