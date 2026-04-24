/**
 * Item shop daily counters ([CardSystem.md]) + permanent inventory bonus from Inventory Expander.
 */
exports.up = async function up(knex) {
  const hasCol = await knex.schema.hasColumn('user_wallets', 'tcg_inventory_bonus_slots');
  if (!hasCol) {
    await knex.schema.alterTable('user_wallets', (table) => {
      table.smallint('tcg_inventory_bonus_slots').unsigned().notNullable().defaultTo(0);
    });
  }

  const hasServer = await knex.schema.hasTable('tcg_shop_server_daily');
  if (!hasServer) {
    await knex.schema.createTable('tcg_shop_server_daily', (table) => {
      table.date('day_utc').notNullable();
      table.string('sku', 64).notNullable();
      table.integer('sold_count').unsigned().notNullable().defaultTo(0);
      table.primary(['day_utc', 'sku']);
    });
  }

  const hasUser = await knex.schema.hasTable('tcg_shop_user_daily');
  if (!hasUser) {
    await knex.schema.createTable('tcg_shop_user_daily', (table) => {
      table.bigInteger('user_id').unsigned().notNullable();
      table.date('day_utc').notNullable();
      table.string('sku', 64).notNullable();
      table.integer('purchase_count').unsigned().notNullable().defaultTo(0);
      table.primary(['user_id', 'day_utc', 'sku']);
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_shop_user_daily');
  await knex.schema.dropTableIfExists('tcg_shop_server_daily');
  const hasCol = await knex.schema.hasColumn('user_wallets', 'tcg_inventory_bonus_slots');
  if (hasCol) {
    await knex.schema.alterTable('user_wallets', (table) => {
      table.dropColumn('tcg_inventory_bonus_slots');
    });
  }
};
