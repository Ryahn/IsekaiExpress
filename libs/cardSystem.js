const config = require('../config');
const { query } = require('../database/db');
const { rollRarity } = require('./tcgRarityRoll');
const tcgEconomy = require('./tcgEconomy');
const tcgInventory = require('./tcgInventory');

const self = (module.exports = {
  getCard: (cardName, typee) => {
    return `${config.url}/cards/${typee}/${cardName}.png`;
  },

  getRarityChances: async () => {
    const rows = await query('rarity').select('*');
    const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
    list.sort((a, b) => String(a.abbreviation).localeCompare(String(b.abbreviation)));
    return list;
  },

  /**
   * @param {number} [_level] reserved for future level-scaled tables
   */
  selectRarity: async (_level) => {
    const rarityChances = await self.getRarityChances();
    if (rarityChances.length === 0) {
      return 'N';
    }
    const withWeight = rarityChances.filter((r) => r.weight != null && Number(r.weight) > 0);
    if (!withWeight.length) {
      return String(rarityChances[0].abbreviation || 'C').toUpperCase();
    }
    return rollRarity(withWeight).abbreviation;
  },

  /**
   * Grant a catalog template to a player (new `user_cards` row, rolled ability).
   * @param {import('discord.js').Client} client
   * @param {{ id: string, username: string }} discordUser
   * @param {{ uuid?: string, cardId?: number }} opts
   */
  giveCard: tcgInventory.grantCardToPlayer,

  /** @type {typeof tcgEconomy.awardTcgBattleXp} */
  awardTcgBattleXp: tcgEconomy.awardTcgBattleXp,
});
