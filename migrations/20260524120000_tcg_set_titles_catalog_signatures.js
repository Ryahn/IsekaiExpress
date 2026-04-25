/**
 * Stage 1 — 3/6 set title unlocks (per user + member) and admin catalog signatures (6/6 Mythic) [CardSystem.md].
 */
const {
  resolveUsersIdType,
  alignUserIdColumnAndFk,
} = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('tcg_catalog_signatures'))) {
    await knex.schema.createTable('tcg_catalog_signatures', (table) => {
      table.string('member_discord_id', 32).primary();
      table.string('ability_key', 64).notNullable();
      table.bigInteger('updated_at').unsigned().notNullable();
    });
  }

  if (!(await knex.schema.hasTable('tcg_set_title_unlocks'))) {
    const { idType: userIdType } = await resolveUsersIdType(knex);
    await knex.schema.createTable('tcg_set_title_unlocks', (table) => {
      table.specificType('user_id', userIdType).notNullable();
      table.string('member_discord_id', 32).notNullable();
      table.string('display_title', 128).notNullable();
      table.bigInteger('unlocked_at').unsigned().notNullable();
      table.primary(['user_id', 'member_discord_id']);
    });
    await knex.schema.alterTable('tcg_set_title_unlocks', (table) => {
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  } else {
    await alignUserIdColumnAndFk(knex, 'tcg_set_title_unlocks', { onDelete: 'CASCADE' });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_set_title_unlocks');
  await knex.schema.dropTableIfExists('tcg_catalog_signatures');
};
