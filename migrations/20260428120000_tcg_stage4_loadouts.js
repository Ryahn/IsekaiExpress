/**
 * Stage 4 — 3-card loadout (main + 2 support). FK to user_cards clears slot when copy is deleted.
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable('tcg_user_loadouts')) return;

  await knex.schema.createTable('tcg_user_loadouts', (table) => {
    table.bigInteger('user_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
    table.bigInteger('main_user_card_id').unsigned().nullable()
      .references('user_card_id').inTable('user_cards').onDelete('SET NULL');
    table.bigInteger('support1_user_card_id').unsigned().nullable()
      .references('user_card_id').inTable('user_cards').onDelete('SET NULL');
    table.bigInteger('support2_user_card_id').unsigned().nullable()
      .references('user_card_id').inTable('user_cards').onDelete('SET NULL');
    table.bigInteger('updated_at').unsigned().notNullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_user_loadouts');
};
