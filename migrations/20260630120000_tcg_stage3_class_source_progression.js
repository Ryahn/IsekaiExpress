/**
 * Stage 3: card source, grades, wallet resources (shards/diamonds/rubies),
 * fusion pity, expeditions, user_cards grade/regrade pity.
 * @param { import("knex").Knex } knex
 */
const { resolveUsersIdType } = require('./helpers/mysqlUsersId');

exports.up = async function (knex) {
  const { idType: userIdType } = await resolveUsersIdType(knex);

  if (!(await knex.schema.hasColumn('card_data', 'source'))) {
    await knex.schema.alterTable('card_data', (table) => {
      table
        .string('source', 16)
        .notNullable()
        .defaultTo('member')
        .index();
    });
  }

  for (const col of ['tcg_shards', 'tcg_diamonds', 'tcg_rubies']) {
    if (!(await knex.schema.hasColumn('user_wallets', col))) {
      await knex.schema.alterTable('user_wallets', (table) => {
        table.bigInteger(col).unsigned().notNullable().defaultTo(0);
      });
    }
  }

  if (!(await knex.schema.hasColumn('user_cards', 'grade'))) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.string('grade', 1).notNullable().defaultTo('D');
    });
  }
  if (!(await knex.schema.hasColumn('user_cards', 'regrade_pity'))) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.integer('regrade_pity').unsigned().notNullable().defaultTo(0);
    });
  }

  if (!(await knex.schema.hasTable('tcg_fusion_pity'))) {
    await knex.schema.createTable('tcg_fusion_pity', (table) => {
      table.specificType('user_id', userIdType).primary();
      table.integer('attempt_count').unsigned().notNullable().defaultTo(0);
      table.bigInteger('last_attempt_at').unsigned().nullable();
    });
    await knex.schema.alterTable('tcg_fusion_pity', (table) => {
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }

  if (!(await knex.schema.hasTable('tcg_expeditions'))) {
    await knex.schema.createTable('tcg_expeditions', (table) => {
      table.bigIncrements('expedition_id').primary();
      table.specificType('user_id', userIdType).notNullable().index();
      table.bigInteger('user_card_id').unsigned().notNullable().index();
      table.tinyint('region').unsigned().notNullable();
      table.string('expedition_type', 24).notNullable();
      table.bigInteger('started_at').unsigned().notNullable();
      table.bigInteger('returns_at').unsigned().notNullable();
      table.boolean('claimed').notNullable().defaultTo(false);
    });
    await knex.schema.alterTable('tcg_expeditions', (table) => {
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('user_card_id').references('user_cards.user_card_id').onDelete('CASCADE');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tcg_expeditions');
  await knex.schema.dropTableIfExists('tcg_fusion_pity');
  for (const col of ['regrade_pity', 'grade']) {
    if (await knex.schema.hasColumn('user_cards', col)) {
      await knex.schema.alterTable('user_cards', (table) => {
        table.dropColumn(col);
      });
    }
  }
  for (const col of ['tcg_rubies', 'tcg_diamonds', 'tcg_shards']) {
    if (await knex.schema.hasColumn('user_wallets', col)) {
      await knex.schema.alterTable('user_wallets', (table) => {
        table.dropColumn(col);
      });
    }
  }
  if (await knex.schema.hasColumn('card_data', 'source')) {
    await knex.schema.alterTable('card_data', (table) => {
      table.dropColumn('source');
    });
  }
};
