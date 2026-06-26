/**
 * Attention archive: destination channel on GuildConfigurable + archive metadata.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await knex.schema.hasTable('GuildConfigurable')) {
    if (!(await hasCol('GuildConfigurable', 'attention_archive_channel_id'))) {
      await knex.schema.alterTable('GuildConfigurable', (table) => {
        table.string('attention_archive_channel_id', 20).nullable();
      });
    }
  }

  if (await knex.schema.hasTable('attention_requests')) {
    if (!(await hasCol('attention_requests', 'archive_message_id'))) {
      await knex.schema.alterTable('attention_requests', (table) => {
        table.string('archive_message_id', 20).nullable();
      });
    }
    if (!(await hasCol('attention_requests', 'archive_channel_id'))) {
      await knex.schema.alterTable('attention_requests', (table) => {
        table.string('archive_channel_id', 20).nullable();
      });
    }
    if (!(await hasCol('attention_requests', 'archived_at'))) {
      await knex.schema.alterTable('attention_requests', (table) => {
        table.timestamp('archived_at').nullable();
      });
    }
  }
};

exports.down = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await hasCol('attention_requests', 'archived_at')) {
    await knex.schema.alterTable('attention_requests', (table) => table.dropColumn('archived_at'));
  }
  if (await hasCol('attention_requests', 'archive_channel_id')) {
    await knex.schema.alterTable('attention_requests', (table) => table.dropColumn('archive_channel_id'));
  }
  if (await hasCol('attention_requests', 'archive_message_id')) {
    await knex.schema.alterTable('attention_requests', (table) => table.dropColumn('archive_message_id'));
  }
  if (await hasCol('GuildConfigurable', 'attention_archive_channel_id')) {
    await knex.schema.alterTable('GuildConfigurable', (table) =>
      table.dropColumn('attention_archive_channel_id'),
    );
  }
};
