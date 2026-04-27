/**
 * Domains to flag in message content (scam URL list from imports).
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const has = await knex.schema.hasTable('blacklisted_link_domains');
  if (has) return;
  await knex.schema.createTable('blacklisted_link_domains', (table) => {
    table.increments('id').primary();
    table.string('host', 253).notNullable().unique();
    table.text('source').nullable();
    table.string('added_by', 20).nullable();
    table.timestamp('added_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('blacklisted_link_domains');
};
