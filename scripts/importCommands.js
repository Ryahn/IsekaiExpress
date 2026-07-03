#!/usr/bin/env node
/**
 * Upsert custom commands from database/schemas/commands.json into MySQL by hash.
 *
 * Usage:
 *   node scripts/importCommands.js [--dry-run] [--file path] [--verbose]
 *   node scripts/importCommands.js --find-duplicates [--by hash,name] [--file path] [--verbose]
 *
 * Env: same MySQL as app (.env)
 */
const fs = require('fs');
const path = require('path');
const knex = require('knex');
const config = require('../config');
const commandRepo = require('../database/repositories/commandSettingsRepository');
const {
  buildImportPlan,
  findDuplicateGroups,
  summarizeDuplicates,
  formatActionLine,
  formatDuplicateLine,
} = require('../libs/commandsImport');

const APP_ROOT = path.join(__dirname, '..');
const DEFAULT_FILE = path.join(APP_ROOT, 'database', 'schemas', 'commands.json');

function resolveAppPath(p) {
  if (!p) return p;
  if (path.isAbsolute(p)) return path.normalize(p);
  return path.join(APP_ROOT, p);
}

function parseArgs(argv) {
  let file = DEFAULT_FILE;
  let dryRun = false;
  let findDuplicates = false;
  let by = ['hash', 'name'];
  let verbose = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--find-duplicates') {
      findDuplicates = true;
    } else if (a === '--verbose') {
      verbose = true;
    } else if (a === '--file') {
      file = resolveAppPath(argv[++i]);
    } else if (a === '--by') {
      const raw = argv[++i] || 'hash,name';
      by = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (!by.length) {
        console.error('--by requires at least one of: hash, name');
        process.exit(1);
      }
      for (const dim of by) {
        if (dim !== 'hash' && dim !== 'name') {
          console.error(`Unknown --by dimension: ${dim} (use hash and/or name)`);
          process.exit(1);
        }
      }
    } else if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else {
      console.error(`Unexpected argument: ${a}`);
      process.exit(1);
    }
  }

  return { file, dryRun, findDuplicates, by, verbose };
}

function loadJsonCommands(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`JSON file not found: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array in ${filePath}`);
  }
  return parsed;
}

async function loadDbCommands(k) {
  return k('commands').select('id', 'hash', 'name', 'content', 'usage', 'created_by', 'updated_by', 'created_at', 'updated_at');
}

function printDuplicateReport(groups, verbose) {
  const summary = summarizeDuplicates(groups);
  console.log('Duplicate audit');
  console.log(`  Total groups:     ${summary.total}`);
  console.log(`  JSON (hash/name): ${summary.json.hash} / ${summary.json.name}`);
  console.log(`  DB (hash/name):   ${summary.db.hash} / ${summary.db.name}`);
  console.log(
    `  Cross-checks:     hash/name=${summary.cross.hash_name_mismatch}, name/hash=${summary.cross.name_hash_mismatch}`,
  );

  if (verbose && groups.length) {
    console.log('');
    for (const group of groups) {
      console.log(formatDuplicateLine(group));
    }
  }

  return groups.length;
}

function printImportSummary(plan, { dryRun }) {
  const { summary } = plan;
  const label = dryRun ? 'Commands import (dry-run)' : 'Commands import';
  console.log(label);
  console.log(`  JSON rows:        ${summary.jsonRows}`);
  console.log(`  Would update:     ${summary.update}`);
  console.log(`  Would insert:     ${summary.insert}`);
  console.log(`  Unchanged:        ${summary.unchanged}`);
  console.log(
    `  Skipped:          ${summary.skipped}  (invalid_name: ${summary.skippedDetail.invalid_name}, hash_mismatch: ${summary.skippedDetail.hash_mismatch}, name_conflict: ${summary.skippedDetail.name_conflict})`,
  );
  console.log(`  DB-only (orphan): ${summary.dbOnly}`);
}

async function applyImportPlan(k, plan) {
  const mutations = plan.actions.filter((a) => a.action === 'update' || a.action === 'insert');
  if (!mutations.length) return { updated: 0, inserted: 0 };

  let updated = 0;
  let inserted = 0;

  await k.transaction(async (trx) => {
    await commandRepo.ensureAppStateRow(trx);

    for (const action of mutations) {
      if (action.action === 'update') {
        await trx('commands').where({ hash: action.json.hash }).update(action.patch);
        updated++;
      } else if (action.action === 'insert') {
        await trx('commands').insert(action.json);
        inserted++;
      }
    }

    if (updated || inserted) {
      await commandRepo.bumpCustomCommandsRevision(trx);
    }
  });

  return { updated, inserted };
}

async function main() {
  const opts = parseArgs(process.argv);
  const { file, dryRun, findDuplicates, by, verbose } = opts;

  const jsonRows = loadJsonCommands(file);

  const k = knex({
    client: 'mysql2',
    connection: {
      host: config.mysql.host,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      port: config.mysql.port,
    },
    pool: { min: 1, max: 4 },
  });

  try {
    const dbRows = await loadDbCommands(k);

    if (findDuplicates) {
      const groups = findDuplicateGroups(jsonRows, dbRows, { by });
      const count = printDuplicateReport(groups, verbose);
      process.exitCode = count > 0 ? 1 : 0;
      return;
    }

    const plan = buildImportPlan(jsonRows, dbRows);
    const dupGroups = findDuplicateGroups(jsonRows, dbRows, { by: ['hash', 'name'] });
    const dupSummary = summarizeDuplicates(dupGroups);

    printImportSummary(plan, { dryRun });
    console.log(
      `  JSON duplicates:  ${dupSummary.json.hash + dupSummary.json.name} (hash: ${dupSummary.json.hash}, name: ${dupSummary.json.name})`,
    );
    console.log(
      `  DB duplicates:    ${dupSummary.db.hash + dupSummary.db.name} (hash: ${dupSummary.db.hash}, name: ${dupSummary.db.name})`,
    );

    if (verbose) {
      console.log('');
      for (const action of plan.actions) {
        console.log(formatActionLine(action));
      }
      if (plan.dbOnly.length) {
        console.log('');
        console.log('DB-only rows (not in JSON):');
        for (const row of plan.dbOnly) {
          console.log(`  DB_ONLY id=${row.id} hash=${row.hash} name=${row.name}`);
        }
      }
    }

    if (dryRun) {
      return;
    }

    const { updated, inserted } = await applyImportPlan(k, plan);
    console.log(`Applied: ${updated} updated, ${inserted} inserted.`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await k.destroy();
  }
}

main();
