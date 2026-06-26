exports.up = async function(knex) {
  const hasTable = async (table) => knex.schema.hasTable(table);
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((exists) => (exists ? knex.schema.hasColumn(table, col) : false));

  if (!(await hasTable('moderation_review_history'))) {
    await knex.schema.createTable('moderation_review_history', (table) => {
      table.increments('id').primary();
      table.string('guild_id', 32).notNullable();
      table.string('event_type', 48).notNullable();
      table.string('subject_type', 48).notNullable();
      table.string('subject_id', 128).nullable();
      table.string('author_id', 32).nullable();
      table.string('channel_id', 32).nullable();
      table.string('source_message_id', 32).nullable();
      table.string('queue_message_id', 32).nullable();
      table.string('status', 32).notNullable().defaultTo('pending');
      table.string('action', 64).nullable();
      table.string('handled_by', 32).nullable();
      table.timestamp('handled_at').nullable();
      table.string('summary', 500).nullable();
      table.text('metadata_json').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['guild_id', 'created_at']);
      table.index(['event_type']);
      table.index(['subject_type']);
      table.index(['status']);
      table.index(['action']);
      table.index(['handled_at']);
      table.index(['author_id']);
      table.index(['channel_id']);
    });
  }

  const linkTargets = [
    ['pending_image_reviews', 'moderation_history_id'],
    ['pending_invites', 'moderation_history_id'],
    ['attention_requests', 'moderation_history_id'],
  ];

  for (const [tableName, columnName] of linkTargets) {
    if (await hasTable(tableName) && !(await hasCol(tableName, columnName))) {
      await knex.schema.alterTable(tableName, (table) => {
        table.integer(columnName).unsigned().nullable();
        table.index([columnName]);
      });
    }
  }
};

exports.down = async function(knex) {
  const hasTable = async (table) => knex.schema.hasTable(table);
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((exists) => (exists ? knex.schema.hasColumn(table, col) : false));

  const linkTargets = [
    ['attention_requests', 'moderation_history_id'],
    ['pending_invites', 'moderation_history_id'],
    ['pending_image_reviews', 'moderation_history_id'],
  ];

  for (const [tableName, columnName] of linkTargets) {
    if (await hasTable(tableName) && await hasCol(tableName, columnName)) {
      await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn(columnName);
      });
    }
  }

  await knex.schema.dropTableIfExists('moderation_review_history');
};
