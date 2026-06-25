/**
 * Reconcile GuildConfigurable feature-toggle columns on FRESH migration-built databases.
 *
 * Migration 20241010025253_add_toggles_to_GuildConfigurable.js intended to add these columns, but
 * it queues the `table.boolean(...)` calls inside an async `.then()` that resolves AFTER the
 * `alterTable` builder has already executed — so on a fresh DB the columns are never actually
 * added. Production has them (added via another path), and the repository/handlers depend on them
 * (serverSettingsExecute toggles, xpSystem level-up gating).
 *
 * Types/defaults match production (SHOW CREATE TABLE GuildConfigurable):
 *   warning_enabled / image_archive_enabled / level_up_enabled / xp_enabled : tinyint(1) DEFAULT 0
 *   level_up_channel : varchar(255) NULL
 *
 * Safety — NO-OP on production: every add is guarded by hasColumn, and production already has all
 * five columns, so nothing runs there. Additive only — no drops, renames, or type changes; rows
 * preserved.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('GuildConfigurable'))) return;

  const addIfMissing = async (name, build) => {
    if (!(await knex.schema.hasColumn('GuildConfigurable', name))) {
      await knex.schema.alterTable('GuildConfigurable', build);
    }
  };

  await addIfMissing('warning_enabled', (t) => t.boolean('warning_enabled').defaultTo(false));
  await addIfMissing('image_archive_enabled', (t) => t.boolean('image_archive_enabled').defaultTo(false));
  await addIfMissing('level_up_enabled', (t) => t.boolean('level_up_enabled').defaultTo(false));
  await addIfMissing('xp_enabled', (t) => t.boolean('xp_enabled').defaultTo(false));
  await addIfMissing('level_up_channel', (t) => t.string('level_up_channel').nullable());
};

/**
 * Intentionally a no-op: these are load-bearing production columns. Reversing by dropping them
 * would break production XP/warning/level-up toggles. Roll back via backup if ever needed.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  // no-op (see note above)
};
