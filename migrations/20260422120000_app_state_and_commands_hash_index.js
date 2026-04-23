/**
 * Global app_state row for cross-process cache invalidation (custom chat commands).
 * Index on commands.hash for lookups.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasAppState = await knex.schema.hasTable('app_state');
  if (!hasAppState) {
    await knex.schema.createTable('app_state', (table) => {
      table.integer('id').unsigned().primary();
      table.bigInteger('custom_commands_revision').unsigned().notNullable().defaultTo(0);
    });
    await knex('app_state').insert({ id: 1, custom_commands_revision: 0 });
  }

  await knex.schema.alterTable('commands', (table) => {
    table.index('hash', 'commands_hash_index');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasAppState = await knex.schema.hasTable('app_state');
  if (hasAppState) {
    await knex.schema.dropTableIfExists('app_state');
  }
  await knex.schema.alterTable('commands', (table) => {
    table.dropIndex('hash', 'commands_hash_index');
  });
};
