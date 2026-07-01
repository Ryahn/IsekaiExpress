const test = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../migrations/20260811220000_commands_hash_unique');

function makeFakeKnex(rows) {
  class Query {
    constructor(table) {
      this.table = table;
      this.grouped = false;
    }

    select() { return this; }
    count() { return this; }
    groupBy() { this.grouped = true; return this; }
    havingRaw() { return this; }

    async exec() {
      if (this.table !== 'commands' || !this.grouped) return [];
      const byHash = new Map();
      for (const row of rows) {
        const group = byHash.get(row.hash) || [];
        group.push(row);
        byHash.set(row.hash, group);
      }
      return [...byHash.entries()]
        .filter(([, group]) => group.length > 1)
        .map(([hash, group]) => ({
          hash,
          count: group.length,
          ids: group.map((row) => row.id).sort((a, b) => a - b).join(','),
        }));
    }

    then(resolve, reject) {
      return this.exec().then(resolve, reject);
    }
  }

  function knex(table) {
    return new Query(table);
  }
  knex.raw = () => ({ raw: true });
  knex.schema = {
    hasTable: async (table) => table === 'commands',
    alterTable: async () => {
      throw new Error('alterTable should not run when duplicates exist');
    },
  };
  return knex;
}

test('commands hash unique migration fails clearly when duplicates exist', async () => {
  const knex = makeFakeKnex([
    { id: 1, hash: 'abc' },
    { id: 2, hash: 'abc' },
    { id: 3, hash: 'def' },
  ]);

  await assert.rejects(
    () => migration.up(knex),
    /Cannot add commands_hash_unique: duplicate command hashes exist.*abc.*ids=1,2/,
  );
});
