/**
 * OCR / pHash blacklists for scam image auto-enforcement.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const has = async (t) => knex.schema.hasTable(t);

  if (!(await has('image_text_blacklist'))) {
    await knex.schema.createTable('image_text_blacklist', (table) => {
      table.increments('id').primary();
      table.string('pattern', 255).notNullable();
      table.enum('pattern_type', ['keyword', 'domain', 'regex']).notNullable().defaultTo('keyword');
      table.string('added_by', 20).nullable();
      table.timestamp('added_at').defaultTo(knex.fn.now());
      table.unique(['pattern', 'pattern_type']);
    });
  }

  if (!(await has('image_hash_blacklist'))) {
    await knex.schema.createTable('image_hash_blacklist', (table) => {
      table.increments('id').primary();
      table.string('phash', 64).notNullable().unique();
      table.string('description', 255).nullable();
      table.string('added_by', 20).nullable();
      table.timestamp('added_at').defaultTo(knex.fn.now());
    });
  }

  const seeds = [
    { pattern: 'porewin', pattern_type: 'keyword' },
    { pattern: 'porewin129', pattern_type: 'keyword' },
    { pattern: 'porewin.net', pattern_type: 'keyword' },
    { pattern: 'porewin129.pro', pattern_type: 'keyword' },
    { pattern: 'withdrawal success', pattern_type: 'keyword' },
    { pattern: 'usdt', pattern_type: 'keyword' },
    { pattern: 'vip-club', pattern_type: 'keyword' },
    { pattern: 'enter the special promo code', pattern_type: 'keyword' },
    { pattern: 'porewin.*casino', pattern_type: 'regex' },
  ];

  for (const row of seeds) {
    const exists = await knex('image_text_blacklist')
      .where({ pattern: row.pattern, pattern_type: row.pattern_type })
      .first();
    if (!exists) {
      await knex('image_text_blacklist').insert({
        pattern: row.pattern,
        pattern_type: row.pattern_type,
        added_by: null,
      });
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('image_hash_blacklist');
  await knex.schema.dropTableIfExists('image_text_blacklist');
};
