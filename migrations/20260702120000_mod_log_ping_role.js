/**
 * Optional role to ping when posting to mod log (modLogId).
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await knex.schema.hasTable('GuildConfigurable')) {
    if (!(await hasCol('GuildConfigurable', 'mod_log_ping_role_id'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.string('mod_log_ping_role_id', 20).nullable();
      });
    }
  }
};

exports.down = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await hasCol('GuildConfigurable', 'mod_log_ping_role_id')) {
    await knex.schema.alterTable('GuildConfigurable', (table) => table.dropColumn('mod_log_ping_role_id'));
  }
};
