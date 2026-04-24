/**
 * Boss Pack pulls can target boss-tagged catalog rows ([CardSystem.md] — small boss card chance).
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasColumn('card_data', 'is_boss_card');
  if (!has) {
    await knex.schema.alterTable('card_data', (table) => {
      table.tinyint('is_boss_card').unsigned().notNullable().defaultTo(0);
    });
  }
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('card_data', 'is_boss_card');
  if (has) {
    await knex.schema.alterTable('card_data', (table) => {
      table.dropColumn('is_boss_card');
    });
  }
};
