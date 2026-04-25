/**
 * [CardSystem.md] Full regular shop charges, preservation seal on cards, trade gold+tax,
 * lending contracts, PvP sessions + pair cooldown.
 */
const {
  resolveUsersIdType,
  alignColumnToUsersIdAndFk,
} = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  const { idType: userIdType } = await resolveUsersIdType(knex);
  const walletCols = [
    ['tcg_iron_veil_charges', (t) => t.tinyint('tcg_iron_veil_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_overclock_charges', (t) => t.tinyint('tcg_overclock_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_null_ward_charges', (t) => t.tinyint('tcg_null_ward_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_revive_shard_charges', (t) => t.tinyint('tcg_revive_shard_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_fusion_catalyst_charges', (t) => t.tinyint('tcg_fusion_catalyst_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_rarity_dust_next_fuse', (t) => t.tinyint('tcg_rarity_dust_next_fuse').unsigned().notNullable().defaultTo(0)],
    ['tcg_trade_license_charges', (t) => t.tinyint('tcg_trade_license_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_recall_token_charges', (t) => t.tinyint('tcg_recall_token_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_preservation_seal_charges', (t) => t.tinyint('tcg_preservation_seal_charges').unsigned().notNullable().defaultTo(0)],
    ['tcg_xp_booster_until', (t) => t.bigInteger('tcg_xp_booster_until').unsigned().nullable()],
  ];

  for (const [name, fn] of walletCols) {
    if (!(await knex.schema.hasColumn('user_wallets', name))) {
      await knex.schema.alterTable('user_wallets', (table) => {
        fn(table);
      });
    }
  }

  if (!(await knex.schema.hasColumn('user_cards', 'tcg_preservation_sealed'))) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.boolean('tcg_preservation_sealed').notNullable().defaultTo(false);
    });
  }

  if (!(await knex.schema.hasColumn('user_cards', 'lent_source_user_card_id'))) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.bigInteger('lent_source_user_card_id').unsigned().nullable().index();
    });
  }

  if (await knex.schema.hasTable('tcg_trade_offers')) {
    const tradeCols = [
      ['proposer_gold', (t) => t.integer('proposer_gold').unsigned().notNullable().defaultTo(0)],
      ['counterparty_gold', (t) => t.integer('counterparty_gold').unsigned().notNullable().defaultTo(0)],
      ['tax_exempt', (t) => t.boolean('tax_exempt').notNullable().defaultTo(false)],
    ];
    for (const [name, fn] of tradeCols) {
      if (!(await knex.schema.hasColumn('tcg_trade_offers', name))) {
        await knex.schema.alterTable('tcg_trade_offers', (table) => {
          fn(table);
        });
      }
    }
  }

  if (!(await knex.schema.hasTable('tcg_lend_contracts'))) {
    await knex.schema.createTable('tcg_lend_contracts', (table) => {
      table.bigIncrements('lend_id').primary();
      table.specificType('lender_user_id', userIdType).notNullable();
      table.specificType('borrower_user_id', userIdType).nullable();
      table.bigInteger('lender_card_id').unsigned().notNullable().references('user_card_id').inTable('user_cards');
      table.bigInteger('borrower_card_id').unsigned().nullable().references('user_card_id').inTable('user_cards');
      table.integer('price_gold').unsigned().notNullable().defaultTo(0);
      table.integer('duration_sec').unsigned().notNullable();
      table.integer('max_battles').unsigned().nullable();
      table.integer('battles_used').unsigned().notNullable().defaultTo(0);
      table.string('status', 16).notNullable().defaultTo('pending');
      table.bigInteger('created_at').unsigned().notNullable();
      table.bigInteger('offer_expires_at').unsigned().notNullable();
      table.bigInteger('loan_end_at').unsigned().nullable();
      table.index(['lender_user_id', 'status']);
      table.index(['borrower_user_id', 'status']);
    });
    await knex.schema.alterTable('tcg_lend_contracts', (table) => {
      table.foreign('lender_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('borrower_user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  } else {
    await alignColumnToUsersIdAndFk(
      knex,
      'tcg_lend_contracts',
      'lender_user_id',
      { onDelete: 'CASCADE' },
      { nullable: false }
    );
    await alignColumnToUsersIdAndFk(
      knex,
      'tcg_lend_contracts',
      'borrower_user_id',
      { onDelete: 'CASCADE' },
      { nullable: true }
    );
  }

  if (!(await knex.schema.hasTable('tcg_pvp_sessions'))) {
    await knex.schema.createTable('tcg_pvp_sessions', (table) => {
      table.bigIncrements('session_id').primary();
      table.specificType('challenger_user_id', userIdType).notNullable();
      table.specificType('target_user_id', userIdType).notNullable();
      table.integer('wager_gold').unsigned().notNullable().defaultTo(0);
      table.string('status', 24).notNullable().defaultTo('pending_accept');
      table.bigInteger('challenger_pick_id').unsigned().nullable().references('user_card_id').inTable('user_cards');
      table.bigInteger('target_pick_id').unsigned().nullable().references('user_card_id').inTable('user_cards');
      table.specificType('winner_user_id', userIdType).nullable();
      table.bigInteger('created_at').unsigned().notNullable();
      table.bigInteger('accept_deadline').unsigned().notNullable();
      table.bigInteger('pick_deadline').unsigned().nullable();
      table.integer('pot_gold').unsigned().notNullable().defaultTo(0);
      table.index(['target_user_id', 'status']);
      table.index(['challenger_user_id', 'status']);
    });
    await knex.schema.alterTable('tcg_pvp_sessions', (table) => {
      table.foreign('challenger_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('target_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('winner_user_id').references('id').inTable('users');
    });
  } else {
    await alignColumnToUsersIdAndFk(
      knex,
      'tcg_pvp_sessions',
      'challenger_user_id',
      { onDelete: 'CASCADE' },
      { nullable: false }
    );
    await alignColumnToUsersIdAndFk(
      knex,
      'tcg_pvp_sessions',
      'target_user_id',
      { onDelete: 'CASCADE' },
      { nullable: false }
    );
    await alignColumnToUsersIdAndFk(
      knex,
      'tcg_pvp_sessions',
      'winner_user_id',
      {},
      { nullable: true }
    );
  }

  if (!(await knex.schema.hasTable('tcg_pvp_cooldowns'))) {
    await knex.schema.createTable('tcg_pvp_cooldowns', (table) => {
      table.bigInteger('user_low').unsigned().notNullable();
      table.bigInteger('user_high').unsigned().notNullable();
      table.bigInteger('until_ts').unsigned().notNullable();
      table.primary(['user_low', 'user_high']);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_pvp_cooldowns');
  await knex.schema.dropTableIfExists('tcg_pvp_sessions');
  await knex.schema.dropTableIfExists('tcg_lend_contracts');

  if (await knex.schema.hasColumn('user_cards', 'lent_source_user_card_id')) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.dropColumn('lent_source_user_card_id');
    });
  }
  if (await knex.schema.hasColumn('user_cards', 'tcg_preservation_sealed')) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.dropColumn('tcg_preservation_sealed');
    });
  }

  const dropWallet = [
    'tcg_xp_booster_until',
    'tcg_preservation_seal_charges',
    'tcg_recall_token_charges',
    'tcg_trade_license_charges',
    'tcg_rarity_dust_next_fuse',
    'tcg_fusion_catalyst_charges',
    'tcg_revive_shard_charges',
    'tcg_null_ward_charges',
    'tcg_overclock_charges',
    'tcg_iron_veil_charges',
  ];
  for (const c of dropWallet) {
    if (await knex.schema.hasColumn('user_wallets', c)) {
      await knex.schema.alterTable('user_wallets', (table) => {
        table.dropColumn(c);
      });
    }
  }

  const dropTrade = ['tax_exempt', 'counterparty_gold', 'proposer_gold'];
  for (const c of dropTrade) {
    if (await knex.schema.hasColumn('tcg_trade_offers', c)) {
      await knex.schema.alterTable('tcg_trade_offers', (table) => {
        table.dropColumn(c);
      });
    }
  }
};
