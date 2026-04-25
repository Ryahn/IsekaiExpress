/**
 * Stage 4 — 3-card loadout (main + 2 support). FK to user_cards clears slot when copy is deleted.
 */
const {
  resolveUsersIdType,
  alignUserIdColumnAndFk,
} = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('tcg_user_loadouts')) {
    await alignUserIdColumnAndFk(knex, 'tcg_user_loadouts', { onDelete: 'CASCADE' });
    return;
  }

  const { idType: userIdType } = await resolveUsersIdType(knex);

  await knex.schema.createTable('tcg_user_loadouts', (table) => {
    table.specificType('user_id', userIdType).notNullable().primary();
    table.bigInteger('main_user_card_id').unsigned().nullable()
      .references('user_card_id').inTable('user_cards').onDelete('SET NULL');
    table.bigInteger('support1_user_card_id').unsigned().nullable()
      .references('user_card_id').inTable('user_cards').onDelete('SET NULL');
    table.bigInteger('support2_user_card_id').unsigned().nullable()
      .references('user_card_id').inTable('user_cards').onDelete('SET NULL');
    table.bigInteger('updated_at').unsigned().notNullable();
  });
  await knex.schema.alterTable('tcg_user_loadouts', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_user_loadouts');
};
