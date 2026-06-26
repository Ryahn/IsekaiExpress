const db = require('./knex');

/**
 * Central database module. The query functions live in domain repositories under
 * ./repositories; this file keeps the same flat export surface (query/db/end/sql + every
 * repository function) so existing call sites keep working unchanged.
 *
 * Dependency direction is one-way to avoid cycles: db.js → repositories → knex.
 */
const xpRepository = require('./repositories/xpRepository');
const moderationRepository = require('./repositories/moderationRepository');
const guildRepository = require('./repositories/guildRepository');
const commandSettingsRepository = require('./repositories/commandSettingsRepository');
const imageReviewRepository = require('./repositories/imageReviewRepository');
const attentionRepository = require('./repositories/attentionRepository');
const moderationReviewHistoryRepository = require('./repositories/moderationReviewHistoryRepository');

module.exports = {
  query: db,
  db: db,
  end: () => db.destroy(),

  /**
   * Run raw SQL. Resolves to the first result set: row array for SELECT, or
   * a ResultSetHeader-like object for INSERT/UPDATE/DELETE (mysql2).
   */
  sql: (query, bindings = []) => db.raw(query, bindings).then((result) => result[0]),

  ...xpRepository,
  ...moderationRepository,
  ...guildRepository,
  ...commandSettingsRepository,
  ...imageReviewRepository,
  ...attentionRepository,
  ...moderationReviewHistoryRepository,
};
