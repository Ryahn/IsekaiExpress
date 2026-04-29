/**
 * Adjust scam-image text blacklist seeds and clear stale pHash rows.
 *
 *  - Removes the over-broad `usdt` keyword (false positives in legitimate crypto chat).
 *  - Adds mrbeast / giveaway-scam keywords.
 *  - Truncates `image_hash_blacklist`: PHASH_BITS changed from 8 (64-bit) to 16 (256-bit),
 *    so any previously stored hashes are in the old format and would never match.
 *
 * @param { import("knex").Knex } knex
 */

const REMOVE_KEYWORDS = [{ pattern: 'usdt', pattern_type: 'keyword' }];

const ADD_KEYWORDS = [
  { pattern: 'mrbeast giveaway', pattern_type: 'keyword' },
  { pattern: 'mr beast giveaway', pattern_type: 'keyword' },
  { pattern: 'claim your prize', pattern_type: 'keyword' },
  { pattern: 'congratulations you won', pattern_type: 'keyword' },
];

exports.up = async function (knex) {
  if (await knex.schema.hasTable('image_hash_blacklist')) {
    await knex('image_hash_blacklist').del();
  }

  if (await knex.schema.hasTable('image_text_blacklist')) {
    for (const row of REMOVE_KEYWORDS) {
      await knex('image_text_blacklist')
        .where({ pattern: row.pattern, pattern_type: row.pattern_type })
        .del();
    }

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
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('image_text_blacklist'))) return;

  for (const row of ADD_KEYWORDS) {
    await knex('image_text_blacklist')
      .where({ pattern: row.pattern, pattern_type: row.pattern_type })
      .del();
  }

  for (const row of REMOVE_KEYWORDS) {
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
