/**
 * Attention queue: destination channel on GuildConfigurable + attention_requests table.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await knex.schema.hasTable('GuildConfigurable')) {
    if (!(await hasCol('GuildConfigurable', 'attention_channel_id'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.string('attention_channel_id', 20).nullable();
      });
    }
  }

  if (!(await knex.schema.hasTable('attention_requests'))) {
    await knex.schema.createTable('attention_requests', (table) => {
      table.increments('id').primary();
      table.string('guild_id', 20).notNullable();
      table.string('author_id', 20).notNullable();
      table.enum('lane', ['mod', 'staff']).notNullable();
      table.text('thread_url').notNullable();
      table.text('profile_url').notNullable();
      table.text('reason').notNullable();
      table
        .enum('status', ['pending', 'handled', 'rejected', 'dismissed'])
        .notNullable()
        .defaultTo('pending');
      table.string('queue_message_id', 20).nullable();
      table.string('queue_channel_id', 20).nullable();
      table.string('reviewed_by', 20).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('resolved_at').nullable();
      table.index(['guild_id', 'status']);
    });
  }
};

exports.down = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await knex.schema.hasTable('attention_requests')) {
    await knex.schema.dropTableIfExists('attention_requests');
  }

  if (await hasCol('GuildConfigurable', 'attention_channel_id')) {
    await knex.schema.alterTable('GuildConfigurable', (table) => table.dropColumn('attention_channel_id'));
  }
};
