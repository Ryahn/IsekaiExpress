/** Stackable charges for Shard of Focus (+15% ATK next PvE/spar — [CardSystem.md]). */
exports.up = async function up(knex) {
  const has = await knex.schema.hasColumn('user_wallets', 'tcg_shard_focus_charges');
  if (!has) {
    await knex.schema.alterTable('user_wallets', (table) => {
      table.tinyint('tcg_shard_focus_charges').unsigned().notNullable().defaultTo(0);
    });
  }
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('user_wallets', 'tcg_shard_focus_charges');
  if (has) {
    await knex.schema.alterTable('user_wallets', (table) => {
      table.dropColumn('tcg_shard_focus_charges');
    });
  }
};
