/**
 * Starboard admin roles: roles allowed to manually add messages via /starboard add.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await knex.schema.hasTable('GuildConfigurable')) {
    if (!(await hasCol('GuildConfigurable', 'starboard_admin_role_ids'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.text('starboard_admin_role_ids').nullable();
      });
    }
  }
};

exports.down = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await hasCol('GuildConfigurable', 'starboard_admin_role_ids')) {
    await knex.schema.alterTable('GuildConfigurable', (table) =>
      table.dropColumn('starboard_admin_role_ids'),
    );
  }
};
