/**
 * Stage 2 — Gold wallet (users.id) + TCG daily / first-win tracking for XP grants.
 */
const {
  resolveUsersIdType,
  alignUserIdColumnAndFk,
} = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('user_wallets');
  if (exists) {
    await alignUserIdColumnAndFk(knex, 'user_wallets', { onDelete: 'CASCADE' });
    return;
  }

  const { idType: userIdType } = await resolveUsersIdType(knex);

  await knex.schema.createTable('user_wallets', (table) => {
    table.specificType('user_id', userIdType).notNullable().primary();
    table.bigInteger('gold').unsigned().notNullable().defaultTo(0);
    table.bigInteger('tcg_daily_claim_at').unsigned().nullable();
    table.string('tcg_first_win_utc_date', 10).nullable();
    table.bigInteger('updated_at').unsigned().notNullable();
  });
  await knex.schema.alterTable('user_wallets', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_wallets');
};
