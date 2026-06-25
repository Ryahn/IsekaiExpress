/**
 * Reconcile caged_users and bans so a FRESH migration-built database matches what the code
 * actually reads/writes. Today `npm run migrate` produces tables the code cannot use:
 *
 *   caged_users: migrations create `expires_at` (NOT NULL) + `old_roles` (NOT NULL); code uses
 *                `expires` and never inserts `expires_at`/`old_roles` → INSERT fails.
 *   bans:        migrations create `banned_by_username` (NOT NULL) and no `method`; code inserts
 *                `method` + `banned_by_user` → INSERT fails.
 *
 * Production works because it was built from the f95bot.sql dump (which already has `expires`,
 * `method`, `banned_by_user` and does NOT have `expires_at`/`banned_by_username`).
 *
 * Safety — this migration is a NO-OP on production:
 *  - New columns are added only `if missing` (prod already has them) and are nullable.
 *  - NOT NULL is relaxed only on the migration-only columns (`expires_at`, `banned_by_username`),
 *    which are gated on their own existence — production never has them, so those branches are
 *    skipped entirely. Nothing is dropped, renamed, or type-narrowed. No data is modified.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  // ---- caged_users ----
  if (await knex.schema.hasTable('caged_users')) {
    const hasExpires = await knex.schema.hasColumn('caged_users', 'expires');
    const hasExpiresAt = await knex.schema.hasColumn('caged_users', 'expires_at');

    if (!hasExpires) {
      await knex.schema.alterTable('caged_users', (t) => {
        t.string('expires').nullable().defaultTo('0');
      });
    }

    // Only migration-built DBs have `expires_at`; relax its + old_roles NOT NULL so the
    // code's INSERT (which omits both) succeeds. Production (no `expires_at`) is untouched.
    if (hasExpiresAt) {
      await knex.schema.alterTable('caged_users', (t) => {
        t.string('expires_at').nullable().alter();
      });
      if (await knex.schema.hasColumn('caged_users', 'old_roles')) {
        await knex.schema.alterTable('caged_users', (t) => {
          t.text('old_roles', 'longtext').nullable().alter();
        });
      }
    }
  }

  // ---- bans ----
  if (await knex.schema.hasTable('bans')) {
    if (!(await knex.schema.hasColumn('bans', 'method'))) {
      await knex.schema.alterTable('bans', (t) => {
        t.string('method').nullable();
      });
    }
    if (!(await knex.schema.hasColumn('bans', 'banned_by_user'))) {
      await knex.schema.alterTable('bans', (t) => {
        t.string('banned_by_user').nullable();
      });
    }
    // Only migration-built DBs have `banned_by_username` (NOT NULL); relax it so the code's
    // INSERT (which omits it) succeeds. Production (no `banned_by_username`) is untouched.
    if (await knex.schema.hasColumn('bans', 'banned_by_username')) {
      await knex.schema.alterTable('bans', (t) => {
        t.string('banned_by_username').nullable().alter();
      });
    }
  }
};

/**
 * Reversal drops only the columns this migration added (if present). It does NOT re-tighten the
 * relaxed NOT NULL constraints (re-tightening could fail on rows containing NULLs).
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  if (await knex.schema.hasTable('caged_users')) {
    if (await knex.schema.hasColumn('caged_users', 'expires')) {
      await knex.schema.alterTable('caged_users', (t) => t.dropColumn('expires'));
    }
  }
  if (await knex.schema.hasTable('bans')) {
    for (const col of ['method', 'banned_by_user']) {
      if (await knex.schema.hasColumn('bans', col)) {
        await knex.schema.alterTable('bans', (t) => t.dropColumn(col));
      }
    }
  }
};
