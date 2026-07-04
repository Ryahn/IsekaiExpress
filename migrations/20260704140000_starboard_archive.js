/**
 * Starboard archive: local backup path per entry for disaster recovery.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await knex.schema.hasTable('starboard_entries')) {
    if (!(await hasCol('starboard_entries', 'archive_path'))) {
      await knex.schema.alterTable('starboard_entries', (table) => {
        table.string('archive_path', 255).nullable();
      });
    }
  }
};

exports.down = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await hasCol('starboard_entries', 'archive_path')) {
    await knex.schema.alterTable('starboard_entries', (table) => table.dropColumn('archive_path'));
  }
};
