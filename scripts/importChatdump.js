#!/usr/bin/env node
/**
 * Bulk import: Discord channel export JSON/HTML + optional phish.gg API.
 * Usage:
 *   node scripts/importChatdump.js [files...] [--dir path] [--mode auto|phish|domains] [--phish-api] [--dry-run] [--added-by userId]
 * Relative paths use the app root (../ from this file), not process.cwd (Docker exec often has cwd /).
 * Env: same MySQL as app (.env), optional CHATDUMP_IMPORT_ADDED_BY
 */
const fs = require('fs');
const path = require('path');
const knex = require('knex');
const config = require('../config');
const { loadExportFileText, importFromLoad } = require('../libs/chatdumpImport');
const { syncPhishGgServers } = require('../libs/phishGgSync');

/** Project root (where package.json lives). Do not use process.cwd() — `docker compose exec` often has cwd=/ */
const APP_ROOT = path.join(__dirname, '..');

/**
 * @param {string} p
 * @returns {string}
 */
function resolveAppPath(p) {
  if (!p) return p;
  if (path.isAbsolute(p)) return path.normalize(p);
  return path.join(APP_ROOT, p);
}

function listExportFilesInDir(rootDir) {
  const out = [];
  const root = resolveAppPath(rootDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(
      `Not a directory: ${rootDir} (resolved: ${root}). ` +
        `In Docker, mount host ./chatdump to /usr/src/app/chatdump and run: docker compose up -d --force-recreate bot. ` +
        `Or: docker compose exec -w ${APP_ROOT} bot node scripts/importChatdump.js --dir chatdump …`,
    );
  }
  function walk(p) {
    for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.(json|html)$/i.test(ent.name)) out.push(full);
    }
  }
  walk(root);
  return out;
}

function parseArgs(argv) {
  const files = [];
  let dir = null;
  let mode = 'auto';
  let phishApi = false;
  let dryRun = false;
  let addedBy = process.env.CHATDUMP_IMPORT_ADDED_BY || null;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') {
      dir = argv[++i];
    } else if (a === '--mode') {
      mode = argv[++i] || 'auto';
    } else if (a === '--phish-api' || a === '--fetch-phish-gg') {
      phishApi = true;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--added-by') {
      addedBy = argv[++i] || null;
    } else if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else {
      files.push(a);
    }
  }

  if (dir) {
    for (const f of listExportFilesInDir(dir)) {
      if (!files.includes(f)) files.push(f);
    }
  }

  return { files, mode, phishApi, dryRun, addedBy };
}

async function main() {
  const opts = parseArgs(process.argv);
  const { files, mode, phishApi, dryRun, addedBy } = opts;

  if (!files.length && !phishApi) {
    console.error(
      'Usage: node scripts/importChatdump.js [files...] [--dir <dir>] [--mode auto|phish|domains] [--phish-api] [--dry-run] [--added-by <id>]',
    );
    process.exit(1);
  }

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

  const totals = {
    files: 0,
    phishMode: 0,
    domainMode: 0,
    inviteUpserts: 0,
    guildUpserts: 0,
    domainRows: 0,
    phishGroups: 0,
  };

  try {
    if (phishApi) {
      console.log(dryRun ? '[dry-run] phish.gg API…' : 'Fetching phish.gg /servers/all…');
      const r = await syncPhishGgServers(k, { addedBy, dryRun });
      console.log(
        `  API rows: ${r.apiCount} | guild upserts: ${r.guildRows} | invite upserts: ${r.inviteRows}${dryRun ? ' (not written)' : ''}`,
      );
      totals.guildUpserts += r.guildRows;
    }

    for (const filePath of files) {
      const abs = resolveAppPath(filePath);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        console.error(`Skip (not a file): ${filePath}`);
        continue;
      }
      const buf = fs.readFileSync(abs, 'utf8');
      const load = loadExportFileText(buf);
      const filenameHint = path.basename(abs);
      console.log(`Processing ${abs}…`);
      const r = await importFromLoad(k, load, { mode, filenameHint, addedBy, dryRun });
      totals.files++;
      if (r.mode === 'domains') {
        totals.domainMode++;
        totals.domainRows += r.domainRows;
        console.log(
          `  mode=domains: domain rows: ${r.domainRows}${dryRun ? ' (dry-run count)' : ''} | text~${r.textBytes} bytes`,
        );
      } else {
        totals.phishMode++;
        totals.phishGroups += r.phishGroups;
        totals.inviteUpserts += r.inviteUpserts;
        totals.guildUpserts += r.guildUpserts;
        console.log(
          `  mode=phish: phish line-groups: ${r.phishGroups} | invite upserts: ${r.inviteUpserts} | guild upserts: ${r.guildUpserts}${dryRun ? ' (dry-run counts)' : ''} | text~${r.textBytes} bytes`,
        );
      }
    }

    console.log('Done.', totals);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await k.destroy();
  }
}

main();
