const test = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../migrations/20260812120000_moderation_action_logs');

function makeFakeKnex({ hasTable = false, createdTables = [] } = {}) {
  const state = { hasTable };
  return {
    schema: {
      hasTable: async (table) => (table === 'moderation_action_logs' ? state.hasTable : false),
      createTable: async (table, builder) => {
        createdTables.push(table);
        const columns = [];
        const tableApi = {
          increments: (name) => {
            const col = { name, type: 'increments' };
            columns.push(col);
            return {
              primary: () => col,
            };
          },
          string: (name, len) => {
            const col = { name, type: 'string', len };
            columns.push(col);
            const chain = {
              notNullable: () => chain,
              nullable: () => chain,
              unique: () => { col.unique = true; return chain; },
              defaultTo: (value) => { col.defaultTo = value; return chain; },
            };
            return chain;
          },
          text: (name) => {
            const col = { name, type: 'text' };
            columns.push(col);
            return { nullable: () => col };
          },
          timestamp: (name) => {
            const col = { name, type: 'timestamp' };
            columns.push(col);
            const chain = {
              notNullable: () => ({
                defaultTo: () => col,
              }),
            };
            return chain;
          },
          index: (cols, name) => {
            columns.push({ index: cols, name });
            return tableApi;
          },
        };
        builder(tableApi);
        state.hasTable = true;
        state.columns = columns;
      },
      dropTableIfExists: async (table) => {
        if (table === 'moderation_action_logs') state.hasTable = false;
      },
    },
    fn: { now: () => 'NOW()' },
    state,
  };
}

test('moderation_action_logs migration creates table when missing', async () => {
  const createdTables = [];
  const knex = makeFakeKnex({ createdTables });
  await migration.up(knex);
  assert.deepEqual(createdTables, ['moderation_action_logs']);
  assert.equal(knex.state.hasTable, true);
  assert.ok(knex.state.columns.some((col) => col.name === 'action_type'));
  assert.ok(knex.state.columns.some((col) => col.name === 'audit_log_entry_id' && col.unique));
});

test('moderation_action_logs migration is idempotent when table exists', async () => {
  const createdTables = [];
  const knex = makeFakeKnex({ hasTable: true, createdTables });
  await migration.up(knex);
  assert.deepEqual(createdTables, []);
});

test('moderation_action_logs migration down drops table', async () => {
  const knex = makeFakeKnex({ hasTable: true });
  await migration.down(knex);
  assert.equal(knex.state.hasTable, false);
});
