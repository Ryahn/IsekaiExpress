/**
 * Stage 4: featured daily offer + cosmetic / consumable exclusives (wallet + user_cards flags).
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('tcg_featured_daily'))) {
    await knex.schema.createTable('tcg_featured_daily', (table) => {
      table.date('day_utc').primary();
      table.string('pool', 1).notNullable();
      table.string('offer_key', 64).notNullable();
      table.string('base_sku', 64).nullable();
      table.tinyint('discount_percent').unsigned().nullable();
      table.tinyint('stock_cap').unsigned().notNullable();
      table.integer('sold_count').unsigned().notNullable().defaultTo(0);
      table.string('announce_message_id', 24).nullable();
      table.string('announce_channel_id', 24).nullable();
      table.bigInteger('rolled_at').unsigned().nullable();
    });
  }

  const cardCols = [
    ['tcg_element_locked', (t) => t.boolean('tcg_element_locked').notNullable().defaultTo(false)],
    ['tcg_golden_frame', (t) => t.boolean('tcg_golden_frame').notNullable().defaultTo(false)],
  ];
  for (const [name, fn] of cardCols) {
    if (!(await knex.schema.hasColumn('user_cards', name))) {
      await knex.schema.alterTable('user_cards', (table) => {
        fn(table);
      });
    }
  }

  const walletCols = [
    ['tcg_element_anchor_charges', (t) => t.tinyint('tcg_element_anchor_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_golden_frame_charges', (t) => t.tinyint('tcg_golden_frame_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_double_drop_charges', (t) => t.tinyint('tcg_double_drop_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_bb_magnet_next', (t) => t.tinyint('tcg_bb_magnet_next').unsigned().notNullable().defaultTo(0)],
    [
      'tcg_season_recall_purchased_for',
      (t) => t.string('tcg_season_recall_purchased_for', 32).nullable(),
    ],
    ['tcg_season_recall_ready', (t) => t.tinyint('tcg_season_recall_ready').unsigned().notNullable().defaultTo(0)],
  ];
  for (const [name, fn] of walletCols) {
    if (!(await knex.schema.hasColumn('user_wallets', name))) {
      await knex.schema.alterTable('user_wallets', (table) => {
        fn(table);
      });
    }
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_featured_daily');

  const dropCard = ['tcg_golden_frame', 'tcg_element_locked'];
  for (const c of dropCard) {
    if (await knex.schema.hasColumn('user_cards', c)) {
      await knex.schema.alterTable('user_cards', (table) => {
        table.dropColumn(c);
      });
    }
  }

  const dropWallet = [
    'tcg_season_recall_ready',
    'tcg_season_recall_purchased_for',
    'tcg_bb_magnet_next',
    'tcg_double_drop_charges',
    'tcg_golden_frame_charges',
    'tcg_element_anchor_charges',
  ];
  for (const c of dropWallet) {
    if (await knex.schema.hasColumn('user_wallets', c)) {
      await knex.schema.alterTable('user_wallets', (table) => {
        table.dropColumn(c);
      });
    }
  }
};
