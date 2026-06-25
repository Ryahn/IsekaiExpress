/**
 * Add a UNIQUE index on users.discord_id (the external Discord identity key used by
 * getLeaderboard's join and checkUser's upsert).
 *
 * Guarded:
 *  - Refuses (throws) if duplicate discord_id rows still exist — it will NOT clean data
 *    automatically. Run the manual dedupe first (see database/README.md).
 *  - Adds the index only if missing (no-op if already present).
 *  - Does not touch user_xp and adds no foreign key.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('users'))) return;

  const dups = await knex('users')
    .select('discord_id')
    .count('* as c')
    .groupBy('discord_id')
    .havingRaw('count(*) > 1');
  if (dups.length > 0) {
    throw new Error(
      `Cannot add users_discord_id_unique: ${dups.length} duplicate discord_id group(s) still exist. ` +
        'Dedupe users first (see database/README.md "users.discord_id uniqueness"). No index was added.',
    );
  }

  const dbRow = await knex.raw('SELECT DATABASE() AS db');
  const dbName = dbRow[0][0].db;
  const existing = await knex('information_schema.STATISTICS')
    .where({ TABLE_SCHEMA: dbName, TABLE_NAME: 'users', INDEX_NAME: 'users_discord_id_unique' })
    .first();
  if (!existing) {
    await knex.schema.alterTable('users', (t) => {
      t.unique(['discord_id'], { indexName: 'users_discord_id_unique' });
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('users'))) return;
  const dbRow = await knex.raw('SELECT DATABASE() AS db');
  const dbName = dbRow[0][0].db;
  const existing = await knex('information_schema.STATISTICS')
    .where({ TABLE_SCHEMA: dbName, TABLE_NAME: 'users', INDEX_NAME: 'users_discord_id_unique' })
    .first();
  if (existing) {
    await knex.schema.alterTable('users', (t) => {
      t.dropUnique(['discord_id'], 'users_discord_id_unique');
    });
  }
};
