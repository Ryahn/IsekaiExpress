const test = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../migrations/20260811190000_scam_scan_rules');
const settingsMigration = require('../migrations/20260811200000_scam_scan_settings');

function makeFakeKnex(seed = {}) {
  const state = {
    tables: new Set(Object.keys(seed)),
    rows: Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((row) => ({ ...row }))])),
  };

  function applyFilters(rows, filters, whereIns) {
    let out = rows;
    for (const filter of filters) {
      out = out.filter((row) => Object.entries(filter).every(([k, v]) => row[k] === v));
    }
    for (const filter of whereIns) {
      out = out.filter((row) => filter.values.includes(row[filter.column]));
    }
    return out;
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.whereIns = [];
      this.firstOnly = false;
    }

    select() { return this; }
    orderBy() { return this; }
    where(filter) { this.filters.push(filter); return this; }
    whereIn(column, values) { this.whereIns.push({ column, values }); return this; }
    first() { this.firstOnly = true; return this; }

    async insert(row) {
      if (!state.rows[this.table]) state.rows[this.table] = [];
      const nextId = state.rows[this.table].length + 1;
      state.rows[this.table].push({ id: row.id || nextId, ...row });
    }

    async exec() {
      const rows = applyFilters(state.rows[this.table] || [], this.filters, this.whereIns);
      return this.firstOnly ? rows[0] : rows;
    }

    then(resolve, reject) {
      return this.exec().then(resolve, reject);
    }
  }

  function knex(table) {
    return new Query(table);
  }

  knex.schema = {
    hasTable: async (table) => state.tables.has(table),
    createTable: async (table, build) => {
      state.tables.add(table);
      if (!state.rows[table]) state.rows[table] = [];
      const chain = {
        primary: () => chain,
        notNullable: () => chain,
        defaultTo: () => chain,
        nullable: () => chain,
        index: () => chain,
        unique: () => chain,
      };
      const tableBuilder = {
        increments: () => chain,
        string: () => chain,
        boolean: () => chain,
        text: () => chain,
        timestamp: () => chain,
        index: () => chain,
        unique: () => chain,
      };
      build(tableBuilder);
    },
    dropTableIfExists: async (table) => {
      state.tables.delete(table);
      delete state.rows[table];
    },
  };
  knex.fn = { now: () => new Date() };
  knex._state = state;
  return knex;
}

test('scam scan rules migration copies legacy keyword and domain rows as auto severity', async () => {
  const knex = makeFakeKnex({
    image_text_blacklist: [
      { id: 1, pattern: 'PoreWin', pattern_type: 'keyword', added_by: 'u1' },
      { id: 2, pattern: 'Example.COM', pattern_type: 'domain', added_by: 'u2' },
      { id: 3, pattern: 'porewin', pattern_type: 'keyword', added_by: 'u3' },
      { id: 4, pattern: 'porewin.*casino', pattern_type: 'regex', added_by: 'u4' },
    ],
  });

  await migration.up(knex);
  await migration.up(knex);

  const rows = knex._state.rows.scam_scan_rules;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.type, r.normalized_pattern, r.severity]), [
    ['keyword', 'porewin', 'auto'],
    ['domain', 'example.com', 'auto'],
  ]);
});

test('scam scan rules rollback drops new table without deleting legacy table', async () => {
  const knex = makeFakeKnex({
    image_text_blacklist: [
      { id: 1, pattern: 'PoreWin', pattern_type: 'keyword', added_by: 'u1' },
    ],
  });

  await migration.up(knex);
  await migration.down(knex);

  assert.equal(knex._state.tables.has('scam_scan_rules'), false);
  assert.equal(knex._state.tables.has('image_text_blacklist'), true);
  assert.equal(knex._state.rows.image_text_blacklist.length, 1);
});

test('scam scan settings migration creates and drops settings table', async () => {
  const knex = makeFakeKnex();

  await settingsMigration.up(knex);
  await settingsMigration.up(knex);
  assert.equal(knex._state.tables.has('scam_scan_settings'), true);

  await settingsMigration.down(knex);
  assert.equal(knex._state.tables.has('scam_scan_settings'), false);
});
