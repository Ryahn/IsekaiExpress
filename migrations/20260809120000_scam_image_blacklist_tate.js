/**
 * Tate-variant MrBeast-style casino scam screenshots (tosowin / cobratate).
 *
 * @param { import("knex").Knex } knex
 */

const ADD_KEYWORDS = [
  { pattern: 'andrew tate', pattern_type: 'keyword' },
  { pattern: 'cobratate', pattern_type: 'keyword' },
  { pattern: 'tosowin', pattern_type: 'keyword' },
];

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('image_text_blacklist'))) return;

  for (const row of ADD_KEYWORDS) {
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
  if (!(await knex.schema.hasTable('image_text_blacklist'))) return;

  for (const row of ADD_KEYWORDS) {
    await knex('image_text_blacklist')
      .where({ pattern: row.pattern, pattern_type: row.pattern_type })
      .del();
  }
};
