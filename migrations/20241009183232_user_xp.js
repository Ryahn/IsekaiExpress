/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const { resolveUsersIdType } = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('user_xp');
  if (exists) return;

  const { idType: userIdType } = await resolveUsersIdType(knex);

  await knex.schema.createTable('user_xp', (table) => {
    table.specificType('user_id', userIdType).notNullable().primary();
    table.bigInteger('xp').defaultTo(0);
    table.integer('message_count').defaultTo(0);
  });
  await knex.schema.alterTable('user_xp', (table) => {
    table.foreign('user_id').references('id').inTable('users');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('user_xp');
};
