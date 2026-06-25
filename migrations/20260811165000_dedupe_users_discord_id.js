/**
 * Dedupe users.discord_id so the following migration (20260811170000_users_discord_id_unique) can
 * add the UNIQUE index. Runs automatically and is safe + recoverable:
 *
 *  - NO-OP when there are no duplicates (fresh DBs, or any already-clean environment).
 *  - Before deleting anything, copies EVERY row in an affected duplicate group into a backup table
 *    `users_dedupe_backup_auto` (created once; not overwritten) so the delete is fully reversible.
 *  - Canonical row per discord_id = highest `is_admin` first, then lowest `id` (preserves an admin
 *    flag and is deterministic). All other rows in the group are deleted.
 *  - The DELETE runs in a transaction. If a duplicate row is still referenced by a foreign key
 *    (e.g. a leftover TCG table on production), MySQL rejects it and the migration FAILS cleanly
 *    with nothing deleted — it never force-removes referenced data. Resolve those refs, then retry.
 *
 * Rollback: restore from `users_dedupe_backup_auto` (or a full backup). Recommended: take a fresh
 * production backup before running migrations regardless.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const BACKUP_TABLE = 'users_dedupe_backup_auto';

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('users'))) return;

  const dupGroups = await knex('users')
    .select('discord_id')
    .count('* as c')
    .groupBy('discord_id')
    .havingRaw('count(*) > 1');
  if (dupGroups.length === 0) return; // already clean — nothing to do

  // 1. Back up every row in the affected groups (idempotent: don't clobber an existing backup).
  if (!(await knex.schema.hasTable(BACKUP_TABLE))) {
    await knex.raw(
      'CREATE TABLE ?? AS SELECT * FROM `users` WHERE `discord_id` IN ' +
        '(SELECT `discord_id` FROM (SELECT `discord_id` FROM `users` GROUP BY `discord_id` HAVING COUNT(*) > 1) g)',
      [BACKUP_TABLE],
    );
  }

  // 2. Compute non-canonical ids: per discord_id keep (is_admin DESC, id ASC), delete the rest.
  const rows = await knex.raw(
    'SELECT u.id AS id FROM `users` u ' +
      'JOIN (SELECT `discord_id`, ' +
      'SUBSTRING_INDEX(GROUP_CONCAT(`id` ORDER BY `is_admin` DESC, `id` ASC), ",", 1) AS keep_id ' +
      'FROM `users` GROUP BY `discord_id` HAVING COUNT(*) > 1) k ' +
      'ON u.`discord_id` = k.`discord_id` AND u.`id` <> k.keep_id',
  );
  const deleteIds = (rows[0] || []).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  if (deleteIds.length === 0) return;

  // 3. Delete in a transaction so a FK rejection rolls back cleanly (no partial deletes).
  const beforeBackup = await knex(BACKUP_TABLE).count('* as c').first();
  await knex.transaction(async (trx) => {
    await trx('users').whereIn('id', deleteIds).del();
  });

  // 4. Verify the duplicates are gone (defensive).
  const stillDup = await knex('users')
    .select('discord_id')
    .count('* as c')
    .groupBy('discord_id')
    .havingRaw('count(*) > 1');
  if (stillDup.length > 0) {
    throw new Error(
      `users dedupe incomplete: ${stillDup.length} duplicate discord_id group(s) remain after delete. ` +
        `Affected rows are preserved in ${BACKUP_TABLE} (${beforeBackup ? beforeBackup.c : '?'} rows).`,
    );
  }
};

/**
 * Not auto-reversible (the deleted duplicate rows were redundant). Restore from
 * `users_dedupe_backup_auto` or a full backup if needed. Intentional no-op.
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  // no-op — see note above
};
