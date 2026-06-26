const test = require('node:test');
const assert = require('node:assert/strict');

function makeFakeDb(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));

  class Query {
    constructor(table) {
      this.table = table;
      this.insertRow = null;
    }

    select() {
      return Promise.resolve(rows.map((row) => ({ ...row })));
    }

    insert(row) {
      this.insertRow = row;
      return this;
    }

    onConflict() {
      return this;
    }

    async merge(update) {
      const existing = rows.find((row) => row.key === this.insertRow.key);
      if (existing) {
        Object.assign(existing, update);
      } else {
        rows.push({ ...this.insertRow });
      }
    }
  }

  function db(table) {
    return new Query(table);
  }

  db.schema = {
    hasTable: async (table) => table === 'scam_scan_settings',
  };
  db.fn = { now: () => new Date() };
  db.transaction = async (fn) => fn(db);
  db._rows = rows;
  return db;
}

function loadRepositoryWithFakes(fakeDb, fakeLogger) {
  const knexPath = require.resolve('../database/knex');
  const loggerPath = require.resolve('../libs/logger');
  const repoPath = require.resolve('../database/repositories/imageReviewRepository');
  const originalKnex = require.cache[knexPath];
  const originalLogger = require.cache[loggerPath];
  delete require.cache[repoPath];
  require.cache[knexPath] = { id: knexPath, filename: knexPath, loaded: true, exports: fakeDb };
  require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: fakeLogger };
  const repo = require('../database/repositories/imageReviewRepository');

  return {
    repo,
    restore() {
      delete require.cache[repoPath];
      if (originalKnex) require.cache[knexPath] = originalKnex;
      else delete require.cache[knexPath];
      if (originalLogger) require.cache[loggerPath] = originalLogger;
      else delete require.cache[loggerPath];
    },
  };
}

test('scam scan settings cache invalidates on save and reloads new values', async () => {
  const fakeDb = makeFakeDb([
    { key: 'scam_scan_total_timeout_ms', value: '25000' },
  ]);
  const fakeLogger = { warn: () => {} };
  const { repo, restore } = loadRepositoryWithFakes(fakeDb, fakeLogger);
  try {
    const first = await repo.getScamScanSettings();
    assert.equal(first.scam_scan_total_timeout_ms, 25000);

    fakeDb._rows.find((row) => row.key === 'scam_scan_total_timeout_ms').value = '30000';
    const cached = await repo.getScamScanSettings();
    assert.equal(cached.scam_scan_total_timeout_ms, 25000);

    const saved = await repo.replaceScamScanSettings({
      settings: { ...repo.getDefaultScamScanSettings(), scam_scan_total_timeout_ms: 30000 },
      userId: 'staff-user',
    });
    assert.equal(saved.ok, true);

    const reloaded = await repo.getScamScanSettings();
    assert.equal(reloaded.scam_scan_total_timeout_ms, 30000);
  } finally {
    restore();
  }
});

test('invalid stored scam scan setting rows are logged once and defaulted safely', async () => {
  const warnings = [];
  const fakeDb = makeFakeDb([
    { key: 'scam_scan_total_timeout_ms', value: 'bad' },
    { key: 'scam_scan_enabled', value: 'maybe' },
  ]);
  const fakeLogger = { warn: (message) => warnings.push(message) };
  const { repo, restore } = loadRepositoryWithFakes(fakeDb, fakeLogger);
  try {
    const settings = await repo.getScamScanSettings();
    await repo.getScamScanSettings();

    assert.equal(settings.scam_scan_total_timeout_ms, 25000);
    assert.equal(settings.scam_scan_enabled, true);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((msg) => msg.includes('scam_scan_total_timeout_ms must be an integer')));
    assert.ok(warnings.some((msg) => msg.includes('scam_scan_enabled must be true or false')));
    assert.ok(warnings.every((msg) => !msg.includes('bad') && !msg.includes('maybe')));
  } finally {
    restore();
  }
});
