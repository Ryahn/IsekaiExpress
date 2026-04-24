/**
 * Stage 2 — Gold wallet (users.id) + TCG daily / first-win tracking for XP grants.
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('user_wallets');
  if (exists) return;

  await knex.schema.createTable('user_wallets', (table) => {
    table.bigInteger('user_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
    table.bigInteger('gold').unsigned().notNullable().defaultTo(0);
    table.bigInteger('tcg_daily_claim_at').unsigned().nullable();
    table.string('tcg_first_win_utc_date', 10).nullable();
    table.bigInteger('updated_at').unsigned().notNullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_wallets');
};
