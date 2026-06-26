exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('scam_scan_settings');
  if (!exists) {
    await knex.schema.createTable('scam_scan_settings', (table) => {
      table.string('key', 100).primary();
      table.string('value', 255).notNullable();
      table.string('updated_by', 32).nullable();
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('scam_scan_settings');
};
