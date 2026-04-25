/**
 * Per-player PvE region / tier progression ([CardSystem.md] — linear unlocks).
 */
const {
  resolveUsersIdType,
  alignUserIdColumnAndFk,
} = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('tcg_pve_progress')) {
    await alignUserIdColumnAndFk(knex, 'tcg_pve_progress', { onDelete: 'CASCADE' });
    return;
  }

  const { idType: userIdType } = await resolveUsersIdType(knex);

  await knex.schema.createTable('tcg_pve_progress', (table) => {
    table.specificType('user_id', userIdType).notNullable().primary();
    table.tinyint('current_region').unsigned().notNullable().defaultTo(1);
    table.tinyint('current_tier').unsigned().notNullable().defaultTo(1);
    table.smallint('wins_in_tier').unsigned().notNullable().defaultTo(0);
    table.tinyint('max_region_unlocked').unsigned().notNullable().defaultTo(1);
    table.smallint('pve_win_streak').unsigned().notNullable().defaultTo(0);
    table.bigInteger('updated_at').unsigned().notNullable();
  });
  await knex.schema.alterTable('tcg_pve_progress', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_pve_progress');
};
