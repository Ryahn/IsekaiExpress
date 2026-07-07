/**
 * Track when custom commands were last invoked (for stale-command curation in the web panel).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('commands', 'last_used_at');
  if (!hasColumn) {
    await knex.schema.alterTable('commands', (table) => {
      table.bigInteger('last_used_at').nullable();
    });
  }

  await knex('commands')
    .where('usage', '>', 0)
    .whereNull('last_used_at')
    .update({ last_used_at: knex.ref('updated_at') });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('commands', 'last_used_at');
  if (hasColumn) {
    await knex.schema.alterTable('commands', (table) => {
      table.dropColumn('last_used_at');
    });
  }
};
