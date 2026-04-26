/**
 * Single source of truth for the `rarity` table. Keep in sync with base card filenames in
 * `tools/base_card/`: `name` → lowercased, spaces → `_` (e.g. Ultra Rare → `ultra_rare.png`).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const RARITY_SEED_ROWS = [
    { abbreviation: 'M',   name: 'Mythic',          weight: 0.1,  stars: 11 },
    { abbreviation: 'L',   name: 'Legendary',        weight: 0.25, stars: 10 },
    { abbreviation: 'UR',  name: 'Ultra Rare',       weight: 0.5,  stars: 9  },
    { abbreviation: 'SUR', name: 'Super Ultra Rare', weight: 0.75, stars: 8  },
    { abbreviation: 'SSR', name: 'Super Super Rare', weight: 1.5,  stars: 7  },
    { abbreviation: 'SR',  name: 'Super Rare',       weight: 2,    stars: 6  },
    { abbreviation: 'U',   name: 'Ultimate',         weight: 5,    stars: 5  },
    { abbreviation: 'R',   name: 'Rare',             weight: 10,   stars: 4  },
    { abbreviation: 'UC',  name: 'Uncommon',         weight: 16,   stars: 3  },
    { abbreviation: 'C',   name: 'Common',           weight: 27,   stars: 2  },
    { abbreviation: 'N',   name: 'Normal',           weight: 37.9, stars: 1  },
];

function rarityNameToBaseCardFileStem(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** @param {string} [abbrev] */
function rarityBaseCardFileStem(abbrev) {
  const a = String(abbrev || 'C').toUpperCase();
  const row = RARITY_SEED_ROWS.find((r) => r.abbreviation === a);
  return row ? rarityNameToBaseCardFileStem(row.name) : null;
}

/** Game keys not in `rarity` seed; align with equivalent tier (SSR = Super Super Rare) */
const AUX_RARITY_STARS = {
  EP: 9,
};

/**
 * Star count for catalog art / card_data from `stars` on the seed row (by batch abbreviation).
 * @param {string} [abbrev]
 * @returns {number|null} null if unknown — caller may fall back to TCG tier
 */
function rarityStarCount(abbrev) {
  const a = String(abbrev || 'C').toUpperCase();
  const row = RARITY_SEED_ROWS.find((r) => r.abbreviation === a);
  if (row) return row.stars;
  if (AUX_RARITY_STARS[a] != null) return AUX_RARITY_STARS[a];
  return null;
}

exports.RARITY_SEED_ROWS = RARITY_SEED_ROWS;
exports.rarityNameToBaseCardFileStem = rarityNameToBaseCardFileStem;
exports.rarityBaseCardFileStem = rarityBaseCardFileStem;
exports.rarityStarCount = rarityStarCount;

exports.seed = async (knex) => knex('rarity')
  .del()
  .then(() => knex('rarity').insert(
    RARITY_SEED_ROWS.map((r) => ({
      abbreviation: r.abbreviation,
      name: r.name,
      high_chance: r.high_chance,
      low_chance: r.low_chance,
      stars: r.stars,
    })),
  ));
