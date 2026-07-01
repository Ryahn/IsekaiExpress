const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeFakeKnex(seed = {}) {
  const state = {
    commands: (seed.commands || []).map((row) => ({ ...row })),
    app_state: (seed.app_state || [{ id: 1, custom_commands_revision: 0 }]).map((row) => ({ ...row })),
    nextId: seed.nextId || ((seed.commands || []).reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1),
  };

  function applyWhere(rows, filters, rawFilters) {
    let result = rows;
    for (const filter of filters) {
      result = result.filter((row) => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value)));
    }
    for (const raw of rawFilters) {
      if (raw.sql === 'LOWER(name) = ?') {
        const expected = String(raw.bindings[0]).toLowerCase();
        result = result.filter((row) => String(row.name || '').toLowerCase() === expected);
      }
    }
    return result;
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.rawFilters = [];
      this.firstOnly = false;
    }

    select() { return this; }
    where(filter) { this.filters.push(filter); return this; }
    whereRaw(sql, bindings) { this.rawFilters.push({ sql, bindings }); return this; }
    first() { this.firstOnly = true; return this; }

    async insert(row) {
      if (this.table === 'commands') {
        if (state.commands.some((command) => command.hash === row.hash)) {
          const error = new Error('Duplicate entry');
          error.code = 'ER_DUP_ENTRY';
          error.errno = 1062;
          throw error;
        }
        const id = state.nextId++;
        state.commands.push({ id, usage: 0, ...row });
        return [id];
      }
      if (this.table === 'app_state') {
        state.app_state.push({ ...row });
        return [row.id];
      }
      throw new Error(`Unexpected insert table ${this.table}`);
    }

    async update(patch) {
      const rows = applyWhere(state[this.table], this.filters, this.rawFilters);
      if (this.table === 'commands' && patch.hash) {
        const targetIds = new Set(rows.map((row) => String(row.id)));
        if (state.commands.some((command) => command.hash === patch.hash && !targetIds.has(String(command.id)))) {
          const error = new Error('Duplicate entry');
          error.code = 'ER_DUP_ENTRY';
          error.errno = 1062;
          throw error;
        }
      }
      for (const row of rows) Object.assign(row, patch);
      return rows.length;
    }

    async delete() {
      const rows = applyWhere(state[this.table], this.filters, this.rawFilters);
      const ids = new Set(rows.map((row) => row.id));
      state[this.table] = state[this.table].filter((row) => !ids.has(row.id));
      return rows.length;
    }

    async increment(column, amount = 1) {
      const rows = applyWhere(state[this.table], this.filters, this.rawFilters);
      for (const row of rows) row[column] = Number(row[column] || 0) + amount;
      return rows.length;
    }

    async exec() {
      const rows = applyWhere(state[this.table], this.filters, this.rawFilters);
      return this.firstOnly ? rows[0] : rows;
    }

    then(resolve, reject) {
      return this.exec().then(resolve, reject);
    }
  }

  function knex(table) {
    return new Query(table);
  }

  knex.table = (table) => new Query(table);
  knex.transaction = async (fn) => fn(knex);
  knex._state = state;
  return knex;
}

function loadRepository(fakeKnex) {
  const repoPath = path.join(__dirname, '..', 'database', 'repositories', 'commandSettingsRepository.js');
  const code = fs.readFileSync(repoPath, 'utf8');
  const module = { exports: {} };
  const context = {
    require: (id) => {
      if (id === '../knex') return fakeKnex;
      return require(id);
    },
    module,
    exports: module.exports,
  };
  vm.runInNewContext(code, context, { filename: repoPath });
  return module.exports;
}

test('duplicate command create is rejected and does not bump revision', async () => {
  const fakeKnex = makeFakeKnex({
    commands: [{ id: 1, hash: '5d41402abc4b2a76b9719d911017c592', name: 'hello', content: 'old' }],
  });
  const repo = loadRepository(fakeKnex);

  const result = await repo.createCustomCommand({ name: 'HELLO', content: 'new', userId: '1' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'duplicate');
  assert.equal(fakeKnex._state.commands.length, 1);
  assert.equal(fakeKnex._state.app_state[0].custom_commands_revision, 0);
});

test('duplicate command rename is rejected and does not bump revision', async () => {
  const fakeKnex = makeFakeKnex({
    commands: [
      { id: 1, hash: '5d41402abc4b2a76b9719d911017c592', name: 'hello', content: 'old' },
      { id: 2, hash: '7d793037a0760186574b0282f2f435e7', name: 'world', content: 'old' },
    ],
  });
  const repo = loadRepository(fakeKnex);

  const result = await repo.updateCustomCommand({ identifier: '2', name: 'hello', content: 'new', userId: '1' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'duplicate');
  assert.equal(fakeKnex._state.commands.find((row) => row.id === 2).name, 'world');
  assert.equal(fakeKnex._state.app_state[0].custom_commands_revision, 0);
});

test('successful create update and delete bump revision', async () => {
  const fakeKnex = makeFakeKnex();
  const repo = loadRepository(fakeKnex);

  const created = await repo.createCustomCommand({ name: 'hello', content: 'old', userId: '1' });
  assert.equal(created.ok, true);
  assert.equal(fakeKnex._state.app_state[0].custom_commands_revision, 1);

  const updated = await repo.updateCustomCommand({ identifier: String(created.command.id), name: 'hello2', content: 'new', userId: '1' });
  assert.equal(updated.ok, true);
  assert.equal(fakeKnex._state.app_state[0].custom_commands_revision, 2);

  const deleted = await repo.deleteCustomCommand(String(created.command.id));
  assert.equal(deleted.ok, true);
  assert.equal(fakeKnex._state.app_state[0].custom_commands_revision, 3);
});

test('failed update and delete do not bump revision', async () => {
  const fakeKnex = makeFakeKnex();
  const repo = loadRepository(fakeKnex);

  const update = await repo.updateCustomCommand({ identifier: '999', name: 'missing', content: 'new', userId: '1' });
  assert.equal(update.ok, false);
  assert.equal(update.reason, 'not_found');

  const del = await repo.deleteCustomCommand('999');
  assert.equal(del.ok, false);
  assert.equal(del.reason, 'not_found');
  assert.equal(fakeKnex._state.app_state[0].custom_commands_revision, 0);
});
