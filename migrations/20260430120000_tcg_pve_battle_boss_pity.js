/**
 * Pity counter for battle-boss card pool drops ([CardSystem.md] — hard pity at 11).
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasColumn('tcg_pve_progress', 'pve_bb_pity');
  if (!has) {
    await knex.schema.alterTable('tcg_pve_progress', (table) => {
      table.smallint('pve_bb_pity').unsigned().notNullable().defaultTo(0);
    });
  }
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('tcg_pve_progress', 'pve_bb_pity');
  if (has) {
    await knex.schema.alterTable('tcg_pve_progress', (table) => {
      table.dropColumn('pve_bb_pity');
    });
  }
};
