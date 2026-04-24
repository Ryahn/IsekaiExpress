/**
 * Per-player PvE region / tier progression ([CardSystem.md] — linear unlocks).
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable('tcg_pve_progress')) return;

  await knex.schema.createTable('tcg_pve_progress', (table) => {
    table.bigInteger('user_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
    table.tinyint('current_region').unsigned().notNullable().defaultTo(1);
    table.tinyint('current_tier').unsigned().notNullable().defaultTo(1);
    table.smallint('wins_in_tier').unsigned().notNullable().defaultTo(0);
    table.tinyint('max_region_unlocked').unsigned().notNullable().defaultTo(1);
    table.smallint('pve_win_streak').unsigned().notNullable().defaultTo(0);
    table.bigInteger('updated_at').unsigned().notNullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_pve_progress');
};
