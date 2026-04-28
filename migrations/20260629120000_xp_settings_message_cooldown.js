/**
 * Message XP: per-channel cooldown + CardSystem defaults (15 XP, 60s).
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const has = await knex.schema.hasColumn('xp_settings', 'message_xp_cooldown_seconds');
  if (!has) {
    await knex.schema.alterTable('xp_settings', (table) => {
      table.integer('message_xp_cooldown_seconds').unsigned().notNullable().defaultTo(60);
    });
  }
  await knex('xp_settings').update({
    min_xp_per_gain: 15,
    max_xp_per_gain: 15,
    message_xp_cooldown_seconds: 60,
  });
};

exports.down = async function (knex) {
  const has = await knex.schema.hasColumn('xp_settings', 'message_xp_cooldown_seconds');
  if (has) {
    await knex.schema.alterTable('xp_settings', (table) => {
      table.dropColumn('message_xp_cooldown_seconds');
    });
  }
};
