/**
 * Track phish.gg sync timestamps in app_state for dependency health dashboards.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('app_state');
  if (!hasTable) return;

  const addColumn = async (name, builder) => {
    const exists = await knex.schema.hasColumn('app_state', name);
    if (!exists) {
      await knex.schema.alterTable('app_state', (table) => builder(table));
    }
  };

  await addColumn('phish_gg_last_sync_at', (table) => table.bigInteger('phish_gg_last_sync_at').nullable());
  await addColumn('phish_gg_last_sync_status', (table) => table.string('phish_gg_last_sync_status', 32).nullable());
  await addColumn('phish_gg_last_sync_summary', (table) => table.text('phish_gg_last_sync_summary').nullable());
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('app_state');
  if (!hasTable) return;

  const dropColumn = async (name) => {
    const exists = await knex.schema.hasColumn('app_state', name);
    if (exists) {
      await knex.schema.alterTable('app_state', (table) => table.dropColumn(name));
    }
  };

  await dropColumn('phish_gg_last_sync_summary');
  await dropColumn('phish_gg_last_sync_status');
  await dropColumn('phish_gg_last_sync_at');
};
