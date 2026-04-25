/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const { resolveUsersIdType } = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('user_cards');
  if (exists) return;

  const { idType: userIdType } = await resolveUsersIdType(knex);

  await knex.schema.createTable('user_cards', (table) => {
    table.bigIncrements('user_card_id').primary();
    table.specificType('user_id', userIdType).notNullable();
    table.bigInteger('card_id').unsigned().references('card_id').inTable('card_data');
    table.integer('quantity').defaultTo(1);
    table.bigInteger('updated_at');
    table.bigInteger('created_at');
    table.unique(['user_id', 'card_id']);
    table.index('quantity', 'quantity_index');
  });
  await knex.schema.alterTable('user_cards', (table) => {
    table.foreign('user_id').references('id').inTable('users');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('user_cards');
};
