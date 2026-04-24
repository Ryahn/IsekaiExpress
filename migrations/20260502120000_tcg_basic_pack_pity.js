/**
 * Basic pack pity — [CardSystem.md] 10 packs without Uncommon → Uncommon on 10th.
 * Stored as consecutive pack opens that contained zero UC pulls (0–9+; force at >= 9).
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasColumn('user_wallets', 'tcg_basic_pack_pity');
  if (!has) {
    await knex.schema.alterTable('user_wallets', (table) => {
      table.smallint('tcg_basic_pack_pity').unsigned().notNullable().defaultTo(0);
    });
  }
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('user_wallets', 'tcg_basic_pack_pity');
  if (has) {
    await knex.schema.alterTable('user_wallets', (table) => {
      table.dropColumn('tcg_basic_pack_pity');
    });
  }
};
