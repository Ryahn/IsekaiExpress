/**
 * PvE "home region" for cards — powers Home Turf / regional bond synergies ([CardSystem.md]).
 * 1–6 matches libs/tcgPveConfig REGION_NAMES; null = no regional tag.
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasColumn('card_data', 'tcg_region');
  if (!has) {
    await knex.schema.alterTable('card_data', (table) => {
      table.tinyint('tcg_region').unsigned().nullable();
    });
  }
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('card_data', 'tcg_region');
  if (has) {
    await knex.schema.alterTable('card_data', (table) => {
      table.dropColumn('tcg_region');
    });
  }
};
