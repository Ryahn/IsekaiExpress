const test = require('node:test');
const assert = require('node:assert/strict');

function makeFakeDb(seed = {}) {
  const tables = {
    scam_scan_history: [],
    scam_scan_history_rule_hits: [],
    ...Object.fromEntries(Object.entries(seed).map(([key, rows]) => [key, rows.map((row) => ({ ...row }))])),
  };
  let lastId = 0;

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.sorts = [];
      this.limitValue = null;
      this.offsetValue = 0;
    }

    select() { return this; }
    orderBy(column, direction = 'asc') { this.sorts.push({ column, direction }); return this; }
    limit(n) { this.limitValue = n; return this; }
    offset(n) { this.offsetValue = n; return this; }

    where(arg, op, value) {
      if (typeof arg === 'object') {
        this.filters.push((row) => Object.entries(arg).every(([key, expected]) => row[key] === expected));
      } else {
        this.filters.push((row) => {
          const actual = row[arg];
          if (op === '>=') return new Date(actual) >= new Date(value);
          if (op === '<=') return new Date(actual) <= new Date(value);
          if (op === '<' && value?.__olderThanDays) {
            return new Date(actual) < new Date(Date.now() - value.__olderThanDays * 86400000);
          }
          if (op === '<') return new Date(actual) < new Date(value);
          return actual === value;
        });
      }
      return this;
    }

    async insert(row) {
      if (!tables[this.table]) tables[this.table] = [];
      const id = row.id || ++lastId;
      tables[this.table].push({ id, ...row });
      return [id];
    }

    async delete() {
      const before = tables[this.table].length;
      const keep = tables[this.table].filter((row) => !this.filters.every((filter) => filter(row)));
      tables[this.table].splice(0, tables[this.table].length, ...keep);
      return before - keep.length;
    }

    exec() {
      let rows = (tables[this.table] || []).filter((row) => this.filters.every((filter) => filter(row)));
      for (const sort of this.sorts.slice().reverse()) {
        rows = rows.slice().sort((a, b) => {
          const av = a[sort.column];
          const bv = b[sort.column];
          if (av === bv) return 0;
          const cmp = av > bv ? 1 : -1;
          return String(sort.direction).toLowerCase() === 'desc' ? -cmp : cmp;
        });
      }
      if (this.offsetValue) rows = rows.slice(this.offsetValue);
      if (this.limitValue != null) rows = rows.slice(0, this.limitValue);
      return Promise.resolve(rows.map((row) => ({ ...row })));
    }

    then(resolve, reject) {
      return this.exec().then(resolve, reject);
    }
  }

  function db(table) {
    return new Query(table);
  }

  db.schema = { hasTable: async (table) => Boolean(tables[table]) };
  db.fn = { now: () => new Date() };
  db.raw = (sql, bindings = []) => ({ __olderThanDays: bindings[0] });
  db.transaction = async (fn) => fn(db);
  db._tables = tables;
  return db;
}

function loadRepositoryWithFakes(fakeDb, fakeLogger = { warn: () => {} }) {
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

function sampleEntry(overrides = {}) {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    attachmentId: 'attachment-1',
    attachmentIndex: 0,
    attachmentUrl: 'https://cdn.example/private-token.png',
    userId: 'user-1',
    isStaffOrMod: false,
    status: 'hit',
    reasonCode: 'ocr',
    failureStage: null,
    manualReviewRequired: true,
    manualReviewQueued: true,
    matchedRules: [{ id: 7, type: 'keyword', severity: 'review' }],
    matchedHashes: [{ id: 3 }],
    severity: 'review',
    image: { bytes: 1234, width: 100, height: 50, format: 'png' },
    timings: { totalMs: 100, ocrMs: 40, phashMs: 10 },
    ocrPreview: 'short preview',
    ...overrides,
  };
}

test('recordScamScanHistory stores sanitized history row and rule hit rows', async () => {
  const fakeDb = makeFakeDb();
  const { repo, restore } = loadRepositoryWithFakes(fakeDb);
  try {
    const id = await repo.recordScamScanHistory(sampleEntry());

    assert.equal(id, 1);
    assert.equal(fakeDb._tables.scam_scan_history.length, 1);
    assert.equal(fakeDb._tables.scam_scan_history[0].attachment_url_hash.length, 64);
    assert.equal(fakeDb._tables.scam_scan_history[0].attachment_url, undefined);
    assert.equal(fakeDb._tables.scam_scan_history[0].ocr_preview, 'short preview');
    assert.equal(fakeDb._tables.scam_scan_history_rule_hits.length, 1);
    assert.equal(fakeDb._tables.scam_scan_history_rule_hits[0].rule_id, '7');
  } finally {
    restore();
  }
});

test('recordScamScanHistory write failure logs and returns null', async () => {
  const warnings = [];
  const fakeDb = makeFakeDb();
  fakeDb.transaction = async () => {
    throw new Error('db write failed');
  };
  const { repo, restore } = loadRepositoryWithFakes(fakeDb, { warn: (...args) => warnings.push(args) });
  try {
    const id = await repo.recordScamScanHistory(sampleEntry());

    assert.equal(id, null);
    assert.ok(warnings.some((entry) => entry.join(' ').includes('Failed to record scam scan history')));
  } finally {
    restore();
  }
});

test('scam scan metrics count statuses reasons and average timings', async () => {
  const now = new Date();
  const fakeDb = makeFakeDb({
    scam_scan_history: [
      { id: 1, status: 'hit', reason_code: 'ocr', failure_stage: null, manual_review_queued: 1, timing_total_ms: 100, timing_ocr_ms: 40, timing_phash_ms: 10, created_at: now },
      { id: 2, status: 'timeout', reason_code: 'ocr_timeout', failure_stage: 'ocr', manual_review_queued: 1, timing_total_ms: 200, timing_ocr_ms: 150, timing_phash_ms: null, created_at: now },
      { id: 3, status: 'clean', reason_code: 'none', failure_stage: null, manual_review_queued: 0, timing_total_ms: 50, timing_ocr_ms: 20, timing_phash_ms: 5, created_at: now },
    ],
  });
  const { repo, restore } = loadRepositoryWithFakes(fakeDb);
  try {
    const metrics = await repo.getScamScanMetrics({ from: new Date(Date.now() - 86400000) });

    assert.equal(metrics.total, 3);
    assert.equal(metrics.byStatus.hit, 1);
    assert.equal(metrics.byReasonCode.ocr_timeout, 1);
    assert.equal(metrics.byFailureStage.ocr, 1);
    assert.equal(metrics.manualReviewQueued, 2);
    assert.equal(metrics.averages.totalMs, 117);
    assert.equal(metrics.max.ocrMs, 150);
  } finally {
    restore();
  }
});

test('scam scan rule hit metrics group rule hits', async () => {
  const now = new Date();
  const fakeDb = makeFakeDb({
    scam_scan_history_rule_hits: [
      { id: 1, scan_history_id: 1, rule_id: '7', rule_type: 'keyword', severity: 'review', created_at: now },
      { id: 2, scan_history_id: 2, rule_id: '7', rule_type: 'keyword', severity: 'review', created_at: now },
      { id: 3, scan_history_id: 3, rule_id: '8', rule_type: 'domain', severity: 'auto', created_at: now },
    ],
  });
  const { repo, restore } = loadRepositoryWithFakes(fakeDb);
  try {
    const hits = await repo.getScamScanRuleHitMetrics({ from: new Date(Date.now() - 86400000) });

    assert.equal(hits[0].rule_id, '7');
    assert.equal(hits[0].hit_count, 2);
    assert.equal(hits[1].rule_type, 'domain');
  } finally {
    restore();
  }
});

test('deleteOldScamScanHistory removes only old rows', async () => {
  const fakeDb = makeFakeDb({
    scam_scan_history: [
      { id: 1, created_at: new Date(Date.now() - 31 * 86400000) },
      { id: 2, created_at: new Date() },
    ],
  });
  const { repo, restore } = loadRepositoryWithFakes(fakeDb);
  try {
    const deleted = await repo.deleteOldScamScanHistory({ olderThanDays: 30 });

    assert.equal(deleted, 1);
    assert.deepEqual(fakeDb._tables.scam_scan_history.map((row) => row.id), [2]);
  } finally {
    restore();
  }
});
