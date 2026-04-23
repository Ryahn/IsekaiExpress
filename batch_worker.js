const fs = require('fs');
const { generateCard } = require('./create_card');
const { powerScoreAtLevel } = require('./src/bot/tcg/cardLayout');
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
          let power;
          if (
            character.powerByRarity
            && Object.prototype.hasOwnProperty.call(character.powerByRarity, key)
            && character.powerByRarity[key] != null
          ) {
            power = character.powerByRarity[key];
          } else if (character.power != null && character.power !== '') {
            power = character.power;
          } else {
            power = powerScoreAtLevel(key, character.level);
          }
          const card = await generateCard(
            character.name,
            key,
            character.class,
            character.level,
            power,
            character.avatar,
            character.type,
            character.discord_id,
          );
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
