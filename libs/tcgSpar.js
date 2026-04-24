const db = require('../database/db');
const { statLevelMultiplier } = require('../src/bot/tcg/cardLayout');
const tcgEconomy = require('./tcgEconomy');
const tcgInventory = require('./tcgInventory');
const tcgLoadout = require('./tcgLoadout');
const tcgBattle = require('./tcgBattle');

/** [CardSystem.md] PvE Tier I–III win — used for casual spar until region progression ships. */
const SPAR_WIN_GOLD = 10;

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function runSpar(client, discordUser) {
  const detail = await tcgLoadout.getLoadoutDetail(client, discordUser);
  if (!detail || !detail.row.main_user_card_id) {
    return { ok: false, error: 'Set a **main** fighter with `/tcg equip` (slot: Main).' };
  }

  const mainId = detail.row.main_user_card_id;
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  const playerRow = await db.query('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .where({
      'user_cards.user_card_id': mainId,
      'user_cards.user_id': internalId,
    })
    .select(
      'user_cards.user_card_id',
      'user_cards.level',
      'card_data.name',
      'card_data.element',
      'card_data.base_atk',
      'card_data.base_def',
      'card_data.base_spd',
      'card_data.base_hp',
    )
    .first();

  if (!playerRow) {
    return { ok: false, error: 'Main card is no longer in your inventory. Pick another main.' };
  }

  const pStats = tcgInventory.combatStatsFromJoinedRow(playerRow);
  if (!pStats) {
    return { ok: false, error: 'Main card is missing base stats (not a catalog template).' };
  }

  const enemyTemplate = await db.query('card_data')
    .whereNotNull('base_atk')
    .whereNotNull('base_def')
    .whereNotNull('base_spd')
    .whereNotNull('base_hp')
    .orderByRaw('RAND()')
    .first();

  if (!enemyTemplate) {
    return { ok: false, error: 'No catalog templates in the database.' };
  }

  const lv = Math.min(5, Math.max(1, Number(playerRow.level) || 1));
  const mult = statLevelMultiplier(lv);
  const enemyStats = {
    atk: Math.round(Number(enemyTemplate.base_atk) * mult),
    def: Math.round(Number(enemyTemplate.base_def) * mult),
    spd: Math.round(Number(enemyTemplate.base_spd) * mult),
    hp: Math.round(Number(enemyTemplate.base_hp) * mult),
  };

  const sim = tcgBattle.simulateMainVsMain(pStats, enemyStats, playerRow.element, enemyTemplate.element, {
    playerLabel: playerRow.name || 'You',
    enemyLabel: enemyTemplate.name ? `${enemyTemplate.name} (spar)` : 'Spar bot',
  });

  const won = sim.outcome === 'win';
  let goldGained = 0;
  if (won) {
    const g = await tcgEconomy.addGold(client, discordUser, SPAR_WIN_GOLD);
    if (!g.ok) return g;
    goldGained = SPAR_WIN_GOLD;
  }

  await tcgEconomy.awardTcgBattleXp(client, discordUser, { won, isPvp: false });

  return {
    ok: true,
    sim,
    goldGained,
    won,
    playerLabel: playerRow.name,
    enemyLabel: enemyTemplate.name,
    playerLevel: lv,
  };
}

module.exports = {
  runSpar,
  SPAR_WIN_GOLD,
};
