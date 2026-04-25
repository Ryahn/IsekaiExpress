/**
 * Card-for-card trade offers ([CardSystem.md] Trading — MVP: instances only, no gold/tax yet).
 */
const {
  resolveUsersIdType,
  alignColumnToUsersIdAndFk,
} = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('tcg_trade_offers')) {
    await alignColumnToUsersIdAndFk(
      knex,
      'tcg_trade_offers',
      'proposer_user_id',
      { onDelete: 'CASCADE' },
      { nullable: false }
    );
    await alignColumnToUsersIdAndFk(
      knex,
      'tcg_trade_offers',
      'counterparty_user_id',
      { onDelete: 'CASCADE' },
      { nullable: false }
    );
    return;
  }

  const { idType: userIdType } = await resolveUsersIdType(knex);

  await knex.schema.createTable('tcg_trade_offers', (table) => {
    table.bigIncrements('trade_id').primary();
    table.specificType('proposer_user_id', userIdType).notNullable();
    table.specificType('counterparty_user_id', userIdType).notNullable();
    table.bigInteger('proposer_instance_id').unsigned().notNullable()
      .references('user_card_id').inTable('user_cards');
    table.bigInteger('counterparty_instance_id').unsigned().notNullable()
      .references('user_card_id').inTable('user_cards');
    table.string('status', 16).notNullable().defaultTo('pending');
    table.bigInteger('created_at').unsigned().notNullable();
    table.bigInteger('expires_at').unsigned().notNullable();
    table.index(['proposer_user_id', 'status']);
    table.index(['counterparty_user_id', 'status']);
  });
  await knex.schema.alterTable('tcg_trade_offers', (table) => {
    table.foreign('proposer_user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('counterparty_user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_trade_offers');
};
