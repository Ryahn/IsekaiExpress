/**
 * Reconcile channel_stats.channel_name on FRESH migration-built databases.
 *
 * Migration 20241010020718_channel_stats.js creates channel_stats WITHOUT a `channel_name` column,
 * but the code (attentionRepository.createChannelStats / getChannelStats, used when the channel
 * stats feature is enabled) reads and writes `channel_name`. Production has the column
 * (`channel_name varchar(255)`); a fresh DB does not.
 *
 * Safety — NO-OP on production: guarded by hasColumn; production already has `channel_name`.
 * Additive only — no drops/renames/type changes; rows preserved.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('channel_stats'))) return;
  if (!(await knex.schema.hasColumn('channel_stats', 'channel_name'))) {
    await knex.schema.alterTable('channel_stats', (t) => {
      t.string('channel_name', 255).nullable();
    });
  }
};

/**
 * Intentionally a no-op: `channel_name` holds data in production; dropping it on rollback would
 * lose it. Roll back via backup if ever needed.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  // no-op (see note above)
};
