/**
 * user_wallets may have been created with BIGINT UNSIGNED while users.id is signed BIGINT,
 * leaving no FK if an older 20260426120000 ran before alignUserIdColumnAndFk existed.
 */
const { alignUserIdColumnAndFk } = require('./helpers/mysqlUsersId');

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('user_wallets')) {
    await alignUserIdColumnAndFk(knex, 'user_wallets', { onDelete: 'CASCADE' });
  }
};

exports.down = async function down() {
  /* data repair; down is a no-op */
};
