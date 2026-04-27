/**
 * Advanced / Premium pack pity — [CardSystem.md]
 * - Advanced: 10 packs without SSR+ → SSR on 10th pack’s last pull (counter force at >= 9)
 * - Premium: 20 packs without Legendary → Legendary on 20th (>= 19)
 * - Premium: 50 packs without Mythic → Mythic on 50th (>= 49)
 */
exports.up = async function up(knex) {
  const add = async (col) => {
    const has = await knex.schema.hasColumn('user_wallets', col);
    if (!has) {
      await knex.schema.alterTable('user_wallets', (table) => {
        table.smallint(col).unsigned().notNullable().defaultTo(0);
      });
    }
  };
  await add('tcg_advanced_pack_pity');
  await add('tcg_premium_pack_pity_legendary');
  await add('tcg_premium_pack_pity_mythic');
};

exports.down = async function down(knex) {
  const drop = async (col) => {
    const has = await knex.schema.hasColumn('user_wallets', col);
    if (has) {
      await knex.schema.alterTable('user_wallets', (table) => {
        table.dropColumn(col);
      });
    }
  };
  await drop('tcg_premium_pack_pity_mythic');
  await drop('tcg_premium_pack_pity_legendary');
  await drop('tcg_advanced_pack_pity');
};
