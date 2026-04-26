/**
 * Rarity: replace high_chance/low_chance with `weight` (11-abbrev first-class).
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasRarity = await knex.schema.hasTable('rarity');
  if (!hasRarity) return;

  const hasWeight = await knex.schema.hasColumn('rarity', 'weight');
  if (!hasWeight) {
    await knex.schema.alterTable('rarity', (t) => {
      t.double('weight').nullable();
    });
  }

  if (await knex.schema.hasColumn('rarity', 'high_chance')) {
    await knex.schema.alterTable('rarity', (t) => {
      t.dropColumn('high_chance');
    });
  }
  if (await knex.schema.hasColumn('rarity', 'low_chance')) {
    await knex.schema.alterTable('rarity', (t) => {
      t.dropColumn('low_chance');
    });
  }
};

exports.down = async function down(knex) {
  const hasRarity = await knex.schema.hasTable('rarity');
  if (!hasRarity) return;

  if (!(await knex.schema.hasColumn('rarity', 'high_chance'))) {
    await knex.schema.alterTable('rarity', (t) => {
      t.float('high_chance').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('rarity', 'low_chance'))) {
    await knex.schema.alterTable('rarity', (t) => {
      t.float('low_chance').nullable();
    });
  }
  if (await knex.schema.hasColumn('rarity', 'weight')) {
    await knex.schema.alterTable('rarity', (t) => {
      t.dropColumn('weight');
    });
  }
};
