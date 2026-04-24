/**
 * Stage 3 — element reroll pricing uses per-card reroll count ([CardSystem.md]).
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasColumn('user_cards', 'element_reroll_count')) return;
  await knex.schema.alterTable('user_cards', (table) => {
    table.integer('element_reroll_count').unsigned().notNullable().defaultTo(0);
  });
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('user_cards', 'element_reroll_count')) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.dropColumn('element_reroll_count');
    });
  }
};
