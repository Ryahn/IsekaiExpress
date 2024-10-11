const fs = require('fs');
const { generateCard } = require('./create_card');
const logger = require('silly-logger');

const batchFilePath = process.argv[2];

logger.startup(`Processing batch from ${batchFilePath}...`);

(async () => {
  // try {
    const batchData = JSON.parse(fs.readFileSync(batchFilePath, 'utf8'));

    for (const character of batchData) {
      logger.info(`Processing character: ${character.name}`);
      for (const [key, value] of Object.entries(character.rarity)) {
        if (value) {
          const card = await generateCard(character.name, key, character.class, character.level, character.power, 11, character.avatar, character.type);
          logger.info(`Generated card: ${card.fileName}`);
        }
      }
    }

    logger.success(`Finished processing batch from ${batchFilePath}. Exiting process...`);
    
    setTimeout(() => {
      //logger.debug('Open Handles:', process._getActiveHandles());
      // logger.debug('Open Requests:', process._getActiveRequests());
      process.exit(0);
    }, 1000);

  // } catch (error) {
  //   logger.error(`Error processing batch: ${error.message}`);
  //   process.exit(1);
  // }
})();
