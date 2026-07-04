/**
 * Starboard: guild settings on GuildConfigurable + starboard_entries tracking table.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await knex.schema.hasTable('GuildConfigurable')) {
    if (!(await hasCol('GuildConfigurable', 'starboard_enabled'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.boolean('starboard_enabled').notNullable().defaultTo(false);
      });
    }
    if (!(await hasCol('GuildConfigurable', 'starboard_channel_id'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.string('starboard_channel_id', 20).nullable();
      });
    }
    if (!(await hasCol('GuildConfigurable', 'starboard_emoji'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.string('starboard_emoji', 128).nullable();
      });
    }
    if (!(await hasCol('GuildConfigurable', 'starboard_threshold'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.integer('starboard_threshold').notNullable().defaultTo(3);
      });
    }
    if (!(await hasCol('GuildConfigurable', 'starboard_allowed_role_ids'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.text('starboard_allowed_role_ids').nullable();
      });
    }
  }

  if (!(await knex.schema.hasTable('starboard_entries'))) {
    await knex.schema.createTable('starboard_entries', (table) => {
      table.increments('id').primary();
      table.string('guild_id', 20).notNullable();
      table.string('source_channel_id', 20).notNullable();
      table.string('source_message_id', 20).notNullable();
      table.string('starboard_message_id', 20).notNullable();
      table.integer('star_count').notNullable().defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['guild_id', 'source_message_id']);
      table.index(['guild_id']);
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable('starboard_entries')) {
    await knex.schema.dropTable('starboard_entries');
  }

  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  for (const col of [
    'starboard_allowed_role_ids',
    'starboard_threshold',
    'starboard_emoji',
    'starboard_channel_id',
    'starboard_enabled',
  ]) {
    if (await hasCol('GuildConfigurable', col)) {
      await knex.schema.alterTable('GuildConfigurable', (table) => table.dropColumn(col));
    }
  }
};
