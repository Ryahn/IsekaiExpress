/**
 * Phase 3: PvP season calendar table.
 * Seasons are quarterly: Winter Circuit, Spring Surge, Summer Clash, Autumn Gauntlet.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('tcg_seasons'))) {
    await knex.schema.createTable('tcg_seasons', (table) => {
      table.string('season_key', 16).primary();
      table.string('name', 64).notNullable();
      // Unix timestamps
      table.bigInteger('start_at').unsigned().notNullable();
      table.bigInteger('end_at').unsigned().notNullable();
      // 2 weeks after start — soft RP boost window
      table.bigInteger('soft_boost_end_at').unsigned().notNullable();
      table.boolean('is_active').notNullable().defaultTo(false);
      // Configurable activity threshold for decay (default 10 PvP battles)
      table.integer('decay_activity_threshold').unsigned().notNullable().defaultTo(10);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_seasons');
};
