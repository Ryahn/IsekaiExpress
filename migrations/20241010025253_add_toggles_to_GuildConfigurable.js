/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('GuildConfigurable').then((exists) => {
    if(exists) {
      return knex.schema.alterTable('GuildConfigurable', (table) => {
        return knex.schema.hasColumn('GuildConfigurable', 'warning_enabled').then((exists) => {
          if(!exists) {
            table.boolean('warning_enabled').defaultTo(false);
            table.boolean('image_archive_enabled').defaultTo(false);
            table.boolean('level_up_enabled').defaultTo(false);
            table.boolean('xp_enabled').defaultTo(false);
            table.string('level_up_channel').nullable();
          }
        });
      });
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.alterTable('GuildConfigurable', (table) => {
    table.dropColumn('warning_enabled');
    table.dropColumn('image_archive_enabled');
    table.dropColumn('level_up_enabled');
    table.dropColumn('xp_enabled');
    table.dropColumn('level_up_channel');
  });
};