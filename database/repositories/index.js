/**
 * Named repository groups. database/db.js spreads these onto its flat export surface;
 * tests and future consumers can import a single domain via, e.g.:
 *   const { xpRepository } = require('../database/repositories');
 */
module.exports = {
  xpRepository: require('./xpRepository'),
  moderationRepository: require('./moderationRepository'),
  guildRepository: require('./guildRepository'),
  commandSettingsRepository: require('./commandSettingsRepository'),
  imageReviewRepository: require('./imageReviewRepository'),
  attentionRepository: require('./attentionRepository'),
};
