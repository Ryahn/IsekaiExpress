const INDEX_NAME = 'channel_stats_channel_id_month_day_unique';

async function hasIndex(knex) {
  const result = await knex.raw(
    `SELECT COUNT(1) AS count
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'channel_stats'
        AND INDEX_NAME = ?`,
    [INDEX_NAME],
  );
  const row = result?.[0]?.[0] || result?.[0];
  return Number(row?.count || 0) > 0;
}

/**
 * Merge duplicate channel/day rows before adding the unique key required by the upsert path.
 * The lowest id survives, totals are summed, and one non-null channel name is kept when present.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('channel_stats'))) return;
  const hasChannelName = await knex.schema.hasColumn('channel_stats', 'channel_name');

  await knex.transaction(async (trx) => {
    const select = trx('channel_stats')
      .select('channel_id', 'month_day')
      .min({ keep_id: 'id' })
      .sum({ merged_total: 'total' })
      .groupBy('channel_id', 'month_day')
      .havingRaw('COUNT(*) > 1');

    if (hasChannelName) {
      select.max({ merged_channel_name: 'channel_name' });
    }

    const duplicateGroups = await select;

    for (const group of duplicateGroups) {
      const update = {
        total: Number(group.merged_total) || 0,
      };
      if (hasChannelName && group.merged_channel_name) {
        update.channel_name = group.merged_channel_name;
      }

      await trx('channel_stats')
        .where({ id: group.keep_id })
        .update(update);

      await trx('channel_stats')
        .where({
          channel_id: group.channel_id,
          month_day: group.month_day,
        })
        .whereNot({ id: group.keep_id })
        .delete();
    }
  });

  if (!(await hasIndex(knex))) {
    await knex.schema.alterTable('channel_stats', (table) => {
      table.unique(['channel_id', 'month_day'], INDEX_NAME);
    });
  }
};

/**
 * Drop only the unique key. Rows are intentionally preserved.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('channel_stats'))) return;
  if (await hasIndex(knex)) {
    await knex.schema.alterTable('channel_stats', (table) => {
      table.dropUnique(['channel_id', 'month_day'], INDEX_NAME);
    });
  }
};
