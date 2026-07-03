/**
 * Migrate legacy `{random:...}` custom command syntax to `{random~...}`.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const { migrateLegacyRandomContent, AI_COMMAND_CONTENT } = require('../libs/customCommandParser');

exports.up = async function up(knex) {
  const rows = await knex('commands')
    .select('id', 'name', 'content')
    .where('content', 'like', '%{random:%');

  for (const row of rows) {
    let content = migrateLegacyRandomContent(row.content);
    if (String(row.name).toLowerCase() === 'ai') {
      content = AI_COMMAND_CONTENT;
    }

    if (content !== row.content) {
      await knex('commands').where({ id: row.id }).update({ content });
    }
  }

  const hasAppState = await knex.schema.hasTable('app_state');
  if (hasAppState) {
    const appState = await knex('app_state').where({ id: 1 }).first();
    if (appState) {
      await knex('app_state').where({ id: 1 }).increment('custom_commands_revision', 1);
    } else {
      await knex('app_state').insert({ id: 1, custom_commands_revision: 1 });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  // Content migration is not safely reversible.
};
