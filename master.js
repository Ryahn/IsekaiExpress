const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const logger = require('./libs/logger');

const uploaderData = require('./src/bot/tcg/uploader_data.json');
const modData = require('./src/bot/tcg/mods_data.json');
const staffData = require('./src/bot/tcg/staff_data.json');
const retiredData = require('./src/bot/tcg/retired_data.json');
const respectedData = require('./src/bot/tcg/respected_data.json');
const trialmodData = require('./src/bot/tcg/trialmod_data.json');

const BATCH_SIZE = 5;

/**
 * For running `master.js` on the host while MySQL is exposed on localhost (e.g. Docker port map).
 * Sets env before fork so workers inherit; `config`/`dotenv` do not override existing env vars.
 * @returns {{ useLocalDb: boolean, dbPort: number | null }}
 */
function applyMysqlCliOverrides(argv = process.argv) {
  const out = { useLocalDb: false, dbPort: null };
  if (argv.includes('--use-local-db')) {
    process.env.MYSQL_HOST = '127.0.0.1';
    out.useLocalDb = true;
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--db-port=')) {
      const p = parseInt(a.slice('--db-port='.length), 10);
      if (!Number.isNaN(p) && p > 0) {
        process.env.MYSQL_PORT = String(p);
        out.dbPort = p;
      }
    } else if (a === '--db-port' && argv[i + 1] != null) {
      const p = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(p) && p > 0) {
        process.env.MYSQL_PORT = String(p);
        out.dbPort = p;
      }
    }
  }
  return out;
}

const mysqlCli = applyMysqlCliOverrides();
const skipDb = process.argv.includes('--skip-db');

/** Role JSON files — same keys as merge sources (see `mergeByDiscordIdPriority`). */
const GROUP_SOURCE = {
  staff: staffData,
  mod: modData,
  trialmod: trialmodData,
  uploader: uploaderData,
  retired: retiredData,
  respected: respectedData,
};
const KNOWN_REGEN_GROUPS = new Set(Object.keys(GROUP_SOURCE));

/**
 * @returns {{ userIds: Set<string>, groupTokens: string[], requested: boolean }}
 */
function parseRegenCli(argv = process.argv) {
  const userIds = new Set();
  const groupTokens = [];
  let requested = false;
  for (const a of argv) {
    if (a.startsWith('--regen-user=')) {
      requested = true;
      for (const part of a.slice('--regen-user='.length).split(',')) {
        const id = part.trim();
        if (id) userIds.add(id);
      }
    }
    if (a.startsWith('--regen-group=')) {
      requested = true;
      for (const part of a.slice('--regen-group='.length).split(',')) {
        const g = part.trim().toLowerCase();
        if (g) groupTokens.push(g);
      }
    }
  }
  return { userIds, groupTokens, requested };
}

/**
 * @param {Set<string>} userIds
 * @param {string[]} groupTokens
 * @returns {{ allow: Set<string>, unknownGroups: string[] }}
 */
function expandRegenAllowList(userIds, groupTokens) {
  const allow = new Set();
  for (const id of userIds) allow.add(String(id));
  const unknownGroups = [];
  for (const g of groupTokens) {
    if (!KNOWN_REGEN_GROUPS.has(g)) {
      unknownGroups.push(g);
      continue;
    }
    for (const row of GROUP_SOURCE[g]) {
      if (row && row.discord_id != null) allow.add(String(row.discord_id));
    }
  }
  return { allow, unknownGroups };
}

const regenCli = parseRegenCli();

/** 6 rarities × 10 elements per character in batch_worker */
const CARDS_PER_CHARACTER = 60;
/** Upper bound per card (load avatar + composite + optional DB); keep generous on slow disks/network */
const MS_PER_CARD_ESTIMATE = 5000;
const WORKER_TIMEOUT_MIN_MS = 3 * 60 * 1000;

/**
 * Same shapes as `import_from_discord.js` (hero rows with `source`, `powerByRarity`, `rarity`, `class`, etc.).
 * When a user appears in more than one role list (e.g. mod + trialmod), the earlier source wins
 * for the full row, except `description`: if the winning row has no blurb, the first non-empty
 * `description` from a later file (same `discord_id`) is copied onto the primary row.
 */
function hasUsableDescription(v) {
  return v != null && String(v).trim().length > 0;
}

function isDescriptionPlaceholder(s) {
  const t = String(s || '').trim();
  if (!t.length) return true;
  if (/^tbd$/i.test(t)) return true;
  if (/^n\/?a$/i.test(t)) return true;
  if (/^\.{3,}$/.test(t)) return true;
  return false;
}

/**
 * @param {Array<Array<Record<string, unknown>>>} sources
 * @param {string} id
 * @param {{ onlyNonPlaceholder?: boolean }} [opts]
 */
function firstDescriptionForId(sources, id, opts = {}) {
  const { onlyNonPlaceholder = false } = opts;
  for (const list of sources) {
    const row = list.find((r) => r && String(r.discord_id) === id);
    if (!row || !hasUsableDescription(row.description)) continue;
    const t = String(row.description).trim();
    if (onlyNonPlaceholder && isDescriptionPlaceholder(t)) continue;
    return t;
  }
  return null;
}

function mergeByDiscordIdPriority(sources) {
  const seen = new Set();
  const out = [];
  for (const list of sources) {
    for (const row of list) {
      if (!row || row.discord_id == null) continue;
      const id = String(row.discord_id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
  }
  for (const primary of out) {
    const id = String(primary.discord_id);
    if (hasUsableDescription(primary.description) && !isDescriptionPlaceholder(primary.description)) {
      continue;
    }
    if (!hasUsableDescription(primary.description)) {
      const fromLater = firstDescriptionForId(sources, id);
      if (fromLater) primary.description = fromLater;
      continue;
    }
    const better = firstDescriptionForId(sources, id, { onlyNonPlaceholder: true });
    if (better) primary.description = better;
  }
  return out;
}

const allCharacterData = mergeByDiscordIdPriority([
  staffData,
  modData,
  trialmodData,
  uploaderData,
  retiredData,
  respectedData,
]);

let characterDataForRun = allCharacterData;
let regenHint = '';
if (regenCli.requested) {
  const { allow, unknownGroups } = expandRegenAllowList(regenCli.userIds, regenCli.groupTokens);
  for (const g of unknownGroups) {
    logger.warn(
      `Unknown --regen-group "${g}" (use: ${[...KNOWN_REGEN_GROUPS].sort().join(', ')})`,
    );
  }
  if (allow.size === 0) {
    logger.error('Regen filter matched no discord IDs; fix --regen-user / --regen-group and try again.');
    process.exit(1);
  }
  const mergedIds = new Set(allCharacterData.map((r) => String(r.discord_id)));
  for (const id of regenCli.userIds) {
    if (!mergedIds.has(String(id))) {
      logger.warn(`--regen-user ${id}: not found in merged character data`);
    }
  }
  characterDataForRun = allCharacterData.filter((row) => allow.has(String(row.discord_id)));
  if (characterDataForRun.length === 0) {
    logger.error('Regen filter excluded every merged row; nothing to run.');
    process.exit(1);
  }
  const parts = [];
  if (regenCli.userIds.size) parts.push(`users=${regenCli.userIds.size}`);
  if (regenCli.groupTokens.length) parts.push(`groups=${[...new Set(regenCli.groupTokens)].join('+')}`);
  regenHint = ` (--regen: ${parts.join(', ')} → ${characterDataForRun.length} character(s))`;
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function workerTimeoutMs(batchLength) {
  return Math.max(
    WORKER_TIMEOUT_MIN_MS,
    batchLength * CARDS_PER_CHARACTER * MS_PER_CARD_ESTIMATE + 120000,
  );
}

function processBatch(data, batchIndex, { skipDb: noDb = false } = {}) {
  return new Promise((resolve, reject) => {
    const batchFilePath = path.join(__dirname, `./batch_${batchIndex}.json`);
    if (fs.existsSync(batchFilePath)) {
      fs.unlinkSync(batchFilePath);
    }
    fs.writeFileSync(batchFilePath, JSON.stringify(data, null, 2));

    const timeoutMs = workerTimeoutMs(data.length);
    logger.startup(
      `Batch ${batchIndex} written to ${batchFilePath}. Spawning worker (timeout ${Math.round(timeoutMs / 1000)}s for ${data.length} character(s))...`,
    );

    const workerArgs = [batchFilePath];
    if (noDb) workerArgs.push('--skip-db');
    const worker = fork('./batch_worker.js', workerArgs);

    const killTimer = setTimeout(() => {
      logger.warn(`Killing worker process for batch ${batchIndex} due to timeout (${timeoutMs}ms)...`);
      worker.kill();
    }, timeoutMs);

    worker.on('exit', (code) => {
      clearTimeout(killTimer);

      logger.info(`Worker process for batch ${batchIndex} exited with code ${code}`);

      if (code === 0) {
        logger.success(`Batch ${batchIndex} processed successfully. Deleting JSON file...`);
        try {
          if (fs.existsSync(batchFilePath)) fs.unlinkSync(batchFilePath);
        } catch (e) {
          logger.warn(`Could not delete ${batchFilePath}: ${e.message}`);
        }
        resolve();
      } else {
        try {
          if (fs.existsSync(batchFilePath)) fs.unlinkSync(batchFilePath);
        } catch (e) {
          /* ignore */
        }
        reject(new Error(`Batch ${batchIndex} exited with code ${code}`));
      }
    });

    worker.on('error', (err) => {
      clearTimeout(killTimer);
      try {
        if (fs.existsSync(batchFilePath)) fs.unlinkSync(batchFilePath);
      } catch (e) {
        /* ignore */
      }
      logger.error(`Worker process for batch ${batchIndex} encountered an error: ${err.message}`);
      reject(err);
    });
  });
}

async function runBatches(data, { skipDb: noDb = false } = {}) {
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, Math.min(i + BATCH_SIZE, data.length));
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    try {
      await processBatch(batch, batchIndex, { skipDb: noDb });
    } catch (e) {
      logger.error(e.message || String(e));
    }
    await delay(2000);
  }
}

const counts = {
  staff: staffData.length,
  mod: modData.length,
  trialmod: trialmodData.length,
  uploader: uploaderData.length,
  retired: retiredData.length,
  respected: respectedData.length,
  merged: allCharacterData.length,
};
const dbCliHint = (() => {
  if (skipDb) return '';
  const parts = [];
  if (mysqlCli.useLocalDb) parts.push('MYSQL_HOST=127.0.0.1');
  if (mysqlCli.dbPort != null) parts.push(`MYSQL_PORT=${mysqlCli.dbPort}`);
  if (!parts.length) return '';
  return ` (${parts.join(', ')} from CLI)`;
})();
logger.startup(
  `TCG batch: files staff=${counts.staff} mod=${counts.mod} trialmod=${counts.trialmod} uploader=${counts.uploader} retired=${counts.retired} respected=${counts.respected} → merged unique=${counts.merged}${regenHint}${skipDb ? ' (--skip-db: no database writes)' : ''}${dbCliHint}`,
);
runBatches(characterDataForRun, { skipDb });
