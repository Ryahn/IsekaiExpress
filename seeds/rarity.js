/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
// seeds/001_rarity.js
exports.seed = async (knex) => {
  return knex('rarity').del()
    .then(function () {
      return knex('rarity').insert([
        { abbreviation: 'UR', name: 'Ultra Rare', high_chance: 1, low_chance: 0.1, stars: 11 },
        { abbreviation: 'SUR', name: 'Super Ultra Rare', high_chance: 1.5, low_chance: 0.3, stars: 10 },
        { abbreviation: 'SSR', name: 'Super Super Rare', high_chance: 1.7, low_chance: 0.5, stars: 9 },
        { abbreviation: 'SR', name: 'Super Rare', high_chance: 2, low_chance: 0.7, stars: 8 },
        { abbreviation: 'L', name: 'Legendary', high_chance: 8, low_chance: 4, stars: 7 },
        { abbreviation: 'M', name: 'Mythic', high_chance: 10, low_chance: 6, stars: 6 },
        { abbreviation: 'U', name: 'Ultimate', high_chance: 12, low_chance: 8, stars: 5 },
        { abbreviation: 'R', name: 'Rare', high_chance: 30, low_chance: 10, stars: 4 },
        { abbreviation: 'UC', name: 'Uncommon', high_chance: 40, low_chance: 25, stars: 3 },
        { abbreviation: 'C', name: 'Common', high_chance: 60, low_chance: 40, stars: 2 },
        { abbreviation: 'N', name: 'Normal', high_chance: 80, low_chance: 50, stars: 1 }
      ]);
    });
};
