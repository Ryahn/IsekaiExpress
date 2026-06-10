/**
 * Phase 2 PvP: RP/rank table + card wager columns on pvp_sessions.
 */
const {
  resolveUsersIdType,
} = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  const { idType: userIdType } = await resolveUsersIdType(knex);

  // tcg_pvp_rank — per-player season RP and rank tier
  if (!(await knex.schema.hasTable('tcg_pvp_rank'))) {
    await knex.schema.createTable('tcg_pvp_rank', (table) => {
      table.specificType('user_id', userIdType).notNullable().primary();
      table.integer('rp').notNullable().defaultTo(0);
      // Bronze / Silver / Gold / Platinum / Diamond / Champion
      table.string('rank_tier', 16).notNullable().defaultTo('Bronze');
      table.integer('season_wins').unsigned().notNullable().defaultTo(0);
      table.integer('season_losses').unsigned().notNullable().defaultTo(0);
      table.string('season_key', 16).notNullable().defaultTo('default');
      table.bigInteger('updated_at').unsigned().notNullable().defaultTo(0);
    });
    await knex.schema.alterTable('tcg_pvp_rank', (table) => {
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }

  // card wager columns on tcg_pvp_sessions
  const wagerCols = [
    ['challenger_card_wager_id', (t) =>
      t.bigInteger('challenger_card_wager_id').unsigned().nullable(),
    ],
    ['target_card_wager_id', (t) =>
      t.bigInteger('target_card_wager_id').unsigned().nullable(),
    ],
  ];
  for (const [name, fn] of wagerCols) {
    if (!(await knex.schema.hasColumn('tcg_pvp_sessions', name))) {
      await knex.schema.alterTable('tcg_pvp_sessions', (table) => {
        fn(table);
      });
    }
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_pvp_rank');
  for (const col of ['challenger_card_wager_id', 'target_card_wager_id']) {
    if (await knex.schema.hasColumn('tcg_pvp_sessions', col)) {
      await knex.schema.alterTable('tcg_pvp_sessions', (table) => {
        table.dropColumn(col);
      });
    }
  }
};
