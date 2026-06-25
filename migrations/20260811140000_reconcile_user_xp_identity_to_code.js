/**
 * Reconcile user_xp.user_id to the production / code-correct shape on FRESH migration-built
 * databases.
 *
 * Verified facts:
 *  - Production user_xp.user_id is varchar(21), PRIMARY KEY, NO foreign key. The code writes
 *    Discord snowflakes (strings) and getLeaderboard joins user_xp.user_id = users.discord_id.
 *  - A FRESH `npm run migrate` instead builds user_xp.user_id as `bigint unsigned` with a
 *    FOREIGN KEY to users.id (from migrations 20241009183232 + helpers/mysqlUsersId). That shape
 *    cannot accept the snowflake string the code inserts, and the FK to users.id rejects it.
 *
 * This migration converts the integer/FK shape to the string/no-FK shape, preserving data by
 * mapping users.id -> users.discord_id. It refuses to continue (throws) rather than silently
 * discard any XP row it cannot map.
 *
 * Safety — NO-OP on production: prod user_xp.user_id is already varchar with no FK, so the FK
 * drop finds nothing, the type check sees a string, and the xp index already exists — every
 * branch is skipped. Nothing is dropped/renamed and no data is touched on prod.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('user_xp'))) return;

  const dbRow = await knex.raw('SELECT DATABASE() AS db');
  const dbName = dbRow[0][0].db;

  // 1. Drop any foreign key on user_xp.user_id that references users.
  const fks = await knex('information_schema.KEY_COLUMN_USAGE')
    .select('CONSTRAINT_NAME')
    .where({
      TABLE_SCHEMA: dbName,
      TABLE_NAME: 'user_xp',
      COLUMN_NAME: 'user_id',
      REFERENCED_TABLE_NAME: 'users',
    });
  for (const fk of fks) {
    await knex.raw('ALTER TABLE `user_xp` DROP FOREIGN KEY `' + fk.CONSTRAINT_NAME + '`');
  }

  // 2. If user_id is an integer type, remap (users.id -> users.discord_id) and convert to string.
  const col = await knex('information_schema.COLUMNS')
    .select('DATA_TYPE')
    .where({ TABLE_SCHEMA: dbName, TABLE_NAME: 'user_xp', COLUMN_NAME: 'user_id' })
    .first();
  const dataType = String((col && col.DATA_TYPE) || '').toLowerCase();
  const isStringType = dataType.includes('char') || dataType === 'text';

  if (!isStringType) {
    // Preflight: every XP row's user_id must map to a users.id that has a discord_id.
    const bad = await knex.raw(
      'SELECT COUNT(*) AS c FROM `user_xp` x ' +
        'LEFT JOIN `users` u ON u.id = x.user_id ' +
        'WHERE u.id IS NULL OR u.discord_id IS NULL',
    );
    const badCount = Number(bad[0][0].c) || 0;
    if (badCount > 0) {
      throw new Error(
        `user_xp identity reconcile aborted: ${badCount} row(s) have a user_id that cannot map to ` +
          'users.id with a discord_id. No data was changed. Resolve the orphans first.',
      );
    }

    const before = await knex.raw('SELECT COUNT(*) AS c FROM `user_xp`');
    const beforeCount = Number(before[0][0].c) || 0;

    if (!(await knex.schema.hasColumn('user_xp', 'user_id_snowflake'))) {
      await knex.raw('ALTER TABLE `user_xp` ADD COLUMN `user_id_snowflake` varchar(21) NULL');
    }
    await knex.raw(
      'UPDATE `user_xp` x JOIN `users` u ON u.id = x.user_id ' +
        'SET x.user_id_snowflake = CAST(u.discord_id AS CHAR)',
    );

    const nul = await knex.raw('SELECT COUNT(*) AS c FROM `user_xp` WHERE user_id_snowflake IS NULL');
    if ((Number(nul[0][0].c) || 0) > 0) {
      throw new Error('user_xp identity reconcile aborted: conversion left unmapped rows. No destructive step taken.');
    }

    // Swap columns: drop PK, drop old integer column, promote the snowflake column to PK.
    await knex.raw('ALTER TABLE `user_xp` DROP PRIMARY KEY');
    await knex.raw('ALTER TABLE `user_xp` DROP COLUMN `user_id`');
    await knex.raw('ALTER TABLE `user_xp` CHANGE COLUMN `user_id_snowflake` `user_id` varchar(21) NOT NULL');
    await knex.raw('ALTER TABLE `user_xp` ADD PRIMARY KEY (`user_id`)');

    const after = await knex.raw('SELECT COUNT(*) AS c FROM `user_xp`');
    if ((Number(after[0][0].c) || 0) !== beforeCount) {
      throw new Error('user_xp identity reconcile: row count changed during conversion — investigate.');
    }
  }

  // 3. Ensure an index on xp exists for getLeaderboard / getUserRank.
  const xpIdx = await knex('information_schema.STATISTICS')
    .where({ TABLE_SCHEMA: dbName, TABLE_NAME: 'user_xp', COLUMN_NAME: 'xp' })
    .first();
  if (!xpIdx) {
    await knex.raw('ALTER TABLE `user_xp` ADD INDEX `user_xp_xp` (`xp`)');
  }
};

/**
 * Not reversible: the identity remap (users.id -> discord_id) cannot be safely undone without the
 * original mapping. Rollback = restore from backup. Intentional no-op.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  // Intentionally empty — see note above.
};
