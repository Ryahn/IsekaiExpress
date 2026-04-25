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

/** 6 rarities × 10 elements per character in batch_worker */
const CARDS_PER_CHARACTER = 60;
/** Upper bound per card (load avatar + composite + optional DB); keep generous on slow disks/network */
const MS_PER_CARD_ESTIMATE = 5000;
const WORKER_TIMEOUT_MIN_MS = 3 * 60 * 1000;

/**
 * Same shapes as `import_from_discord.js` (hero rows with `powerByRarity`, `rarity`, `class`, etc.).
 * When a user appears in more than one role list (e.g. mod + trialmod), the earlier source wins.
 */
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

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function workerTimeoutMs(batchLength) {
  return Math.max(
    WORKER_TIMEOUT_MIN_MS,
    batchLength * CARDS_PER_CHARACTER * MS_PER_CARD_ESTIMATE + 120000,
  );
}

function processBatch(data, batchIndex) {
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

    const worker = fork('./batch_worker.js', [batchFilePath]);

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

async function runBatches(data) {
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, Math.min(i + BATCH_SIZE, data.length));
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    try {
      await processBatch(batch, batchIndex);
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
logger.startup(
  `TCG batch: files staff=${counts.staff} mod=${counts.mod} trialmod=${counts.trialmod} uploader=${counts.uploader} retired=${counts.retired} respected=${counts.respected} → merged unique=${counts.merged}`,
);
runBatches(allCharacterData);
