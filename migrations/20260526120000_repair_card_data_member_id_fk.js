/**
 * Align card_data.member_id with users.id when stage 2 ran before ensureNullableUserFkColumn.
 */
const { ensureNullableUserFkColumn } = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  if (await knex.schema.hasColumn('card_data', 'member_id')) {
    await ensureNullableUserFkColumn(knex, 'card_data', 'member_id');
  }
};

exports.down = async function down() {
  /* data repair; down is a no-op */
};
