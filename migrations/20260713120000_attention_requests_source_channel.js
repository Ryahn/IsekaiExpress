/**
 * Channel where the submitter ran /attention (ping author there on resolve; uploaders may not see mod queue).
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await knex.schema.hasTable('attention_requests')) {
    if (!(await hasCol('attention_requests', 'source_channel_id'))) {
      await knex.schema.alterTable('attention_requests', (table) => {
        table.string('source_channel_id', 20).nullable();
      });
    }
  }
};

exports.down = async function (knex) {
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (await hasCol('attention_requests', 'source_channel_id')) {
    await knex.schema.alterTable('attention_requests', (table) => table.dropColumn('source_channel_id'));
  }
};
