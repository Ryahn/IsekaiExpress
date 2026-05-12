/**
 * Request kind + ticket URL + extra notes; relax NOT NULL on legacy columns for new shapes.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('attention_requests'))) return;

  const hasCol = async (col) => knex.schema.hasColumn('attention_requests', col);

  if (!(await hasCol('request_type'))) {
    await knex.schema.alterTable('attention_requests', (table) => {
      table.string('request_type', 32).notNullable().defaultTo('legacy_form');
    });
  }
  if (!(await hasCol('ticket_url'))) {
    await knex.schema.alterTable('attention_requests', (table) => {
      table.text('ticket_url').nullable();
    });
  }
  if (!(await hasCol('extra_notes'))) {
    await knex.schema.alterTable('attention_requests', (table) => {
      table.text('extra_notes').nullable();
    });
  }

  await knex.raw('ALTER TABLE attention_requests MODIFY thread_url TEXT NULL');
  await knex.raw('ALTER TABLE attention_requests MODIFY profile_url TEXT NULL');
  await knex.raw('ALTER TABLE attention_requests MODIFY reason TEXT NULL');
};

exports.down = async function () {
  /* Down would require restoring NOT NULL on rows that may contain NULLs; leave empty. */
};
