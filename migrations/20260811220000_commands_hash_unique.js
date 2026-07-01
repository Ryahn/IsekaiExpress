const INDEX_NAME = 'commands_hash_unique';

async function hasIndex(knex) {
  const result = await knex.raw(
    `SELECT COUNT(1) AS count
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'commands'
        AND INDEX_NAME = ?`,
    [INDEX_NAME],
  );
  const row = result?.[0]?.[0] || result?.[0];
  return Number(row?.count || 0) > 0;
}

async function findDuplicateHashes(knex) {
  return knex('commands')
    .select('hash')
    .count('* as count')
    .select(knex.raw('GROUP_CONCAT(id ORDER BY id) AS ids'))
    .groupBy('hash')
    .havingRaw('COUNT(*) > 1');
}

/**
 * Single-guild custom commands must be unique by hash. This migration refuses to
 * guess which duplicate command should survive; operators must dedupe first.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('commands'))) return;

  const duplicates = await findDuplicateHashes(knex);
  if (duplicates.length) {
    const summary = duplicates
      .map((row) => `${row.hash} (count=${row.count}, ids=${row.ids})`)
      .join('; ');
    throw new Error(
      `Cannot add ${INDEX_NAME}: duplicate command hashes exist. Dedupe commands first: ${summary}`,
    );
  }

  if (!(await hasIndex(knex))) {
    await knex.schema.alterTable('commands', (table) => {
      table.unique(['hash'], INDEX_NAME);
    });
  }
};

/**
 * Drop only the unique key. Command rows are preserved.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('commands'))) return;
  if (await hasIndex(knex)) {
    await knex.schema.alterTable('commands', (table) => {
      table.dropUnique(['hash'], INDEX_NAME);
    });
  }
};
