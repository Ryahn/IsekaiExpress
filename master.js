const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const logger = require('silly-logger');

const uploaderData = require('./src/bot/tcg/uploader_data.json');
const modData = require('./src/bot/tcg/mods_data.json');
const staffData = require('./src/bot/tcg/staff_data.json');
const retiredData = require('./src/bot/tcg/retired_data.json');
const BATCH_SIZE = 5;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processBatch(data, batchIndex) {
  const batchFilePath = path.join(__dirname, `./batch_${batchIndex}.json`);
  if (fs.existsSync(batchFilePath)) {
    fs.unlinkSync(batchFilePath);
  }
  fs.writeFileSync(batchFilePath, JSON.stringify(data, null, 2));

  logger.startup(`Batch ${batchIndex} written to ${batchFilePath}. Spawning a new process...`);

  const worker = fork('./batch_worker.js', [batchFilePath]);

  const timeout = setTimeout(() => {
    logger.warn(`Killing worker process for batch ${batchIndex} due to timeout...`);
	// fs.unlinkSync(batchFilePath);
    worker.kill();
  }, 30000);

  worker.on('exit', (code) => {
    clearTimeout(timeout);

    logger.info(`Worker process for batch ${batchIndex} exited with code ${code}`);
    
    if (code === 0) {
      logger.success(`Batch ${batchIndex} processed successfully. Deleting JSON file...`);
      fs.unlinkSync(batchFilePath);
    } else {
      fs.unlinkSync(batchFilePath);
      logger.error(`Batch ${batchIndex} process failed with code ${code}.`);
    }
  });

  worker.on('error', (err) => {
	fs.unlinkSync(batchFilePath);
    logger.error(`Worker process for batch ${batchIndex} encountered an error: ${err.message}`);
  });
}

async function runBatches(data) {
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, Math.min(i + BATCH_SIZE, data.length));
    await processBatch(batch, Math.floor(i / BATCH_SIZE) + 1);
    await delay(32000);
  }
}

runBatches(modData);
