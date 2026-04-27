const fs = require('fs');
const { generateCard } = require('./create_card');
const { ELEMENT_IDS } = require('./src/bot/tcg/elements');
const { RARITY_ORDER } = require('./src/bot/tcg/rarityOrder');
const logger = require('./libs/logger');

const BATCH_RARITY_KEYS = [...RARITY_ORDER];

const batchFilePath = process.argv[2];
const skipDb = process.argv.includes('--skip-db');

logger.startup(
  `Processing batch from ${batchFilePath}${skipDb ? ' (--skip-db)' : ''}...`,
);

(async () => {
  try {
  const batchData = JSON.parse(fs.readFileSync(batchFilePath, 'utf8'));

  for (const character of batchData) {
    logger.info(`Processing character: ${character.name}`);
    const hasRarityConfig = character.rarity
      && typeof character.rarity === 'object'
      && Object.keys(character.rarity).length > 0;
    const rarityKeys = BATCH_RARITY_KEYS.filter((key) => {
      if (!hasRarityConfig) return true;
      if (!Object.prototype.hasOwnProperty.call(character.rarity, key)) return false;
      const v = character.rarity[key];
      return v !== false && v !== 0;
    });
    for (const rarityKey of rarityKeys) {
      for (const elementId of ELEMENT_IDS) {
        const card = await generateCard(
          character.name,
          rarityKey,
          character.class,
          character.avatar,
          character.type,
          character.discord_id,
          elementId,
          null,
          { skipDb, cardDescription: character.description },
        );
        logger.info(`Generated card: ${card.outputPath}`);
      }
    }
  }

  logger.success(`Finished processing batch from ${batchFilePath}. Exiting process...`);

  setTimeout(() => {
    process.exit(0);
  }, 1000);
  } catch (err) {
    logger.error(err.message || String(err));
    process.exit(1);
  }
})();
