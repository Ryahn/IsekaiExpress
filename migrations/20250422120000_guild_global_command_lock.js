/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.hasTable('GuildConfigurable').then((exists) => {
    if (!exists) return;
    return knex.schema.hasColumn('GuildConfigurable', 'global_commands_locked').then((col) => {
      if (col) return;
      return knex.schema.alterTable('GuildConfigurable', (table) => {
        table.boolean('global_commands_locked').notNullable().defaultTo(false);
        table.text('global_commands_whitelist_channel_ids').nullable();
      });
    });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.hasTable('GuildConfigurable').then((exists) => {
    if (!exists) return;
    return knex.schema.alterTable('GuildConfigurable', (table) => {
      table.dropColumn('global_commands_locked');
      table.dropColumn('global_commands_whitelist_channel_ids');
    });
  });
};
