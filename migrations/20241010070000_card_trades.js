/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const { resolveUsersIdType } = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('card_trades');
  if (!exists) {
    const { idType: userIdType } = await resolveUsersIdType(knex);

    await knex.schema.createTable('card_trades', (table) => {
      table.bigIncrements('trade_id').primary();
      table.specificType('sender_id', userIdType).notNullable();
      table.specificType('receiver_id', userIdType).notNullable();
      table.bigInteger('card_id').unsigned().references('card_id').inTable('card_data');
      table.bigInteger('quantity');
      table.enum('status', ['pending', 'accepted', 'rejected']).defaultTo('pending');
      table.bigInteger('updated_at');
      table.bigInteger('created_at');
    });
    await knex.schema.alterTable('card_trades', (table) => {
      table.foreign('sender_id').references('id').inTable('users');
      table.foreign('receiver_id').references('id').inTable('users');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('card_trades');
};
