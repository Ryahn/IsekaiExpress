/**
 * Drop the orphaned TCG/card production tables. The TCG feature was removed (src/bot/tcg deleted,
 * 31 TCG migrations converted to no-op stubs); these tables are no longer referenced by any
 * runtime code, and verified (2026-06-25) to have no foreign keys from any non-TCG table.
 *
 * BACKUP REQUIRED before applying. Take a full dump and a TCG-only dump first, e.g.:
 *   mysqldump … "$MYSQL_DATABASE" > f95bot_full_backup_YYYY-MM-DD.sql
 *   mysqldump … "$MYSQL_DATABASE" <tcg tables> > f95bot_tcg_tables_backup_YYYY-MM-DD.sql
 *
 * Drop order is FK-safe: the only intra-set FK parent is `user_cards` (referenced by
 * tcg_expeditions, tcg_lend_contracts, tcg_pvp_sessions, tcg_trade_offers, tcg_user_loadouts), so
 * those are dropped first, then user_cards, then the remaining tables (which only FK to `users`,
 * which is NOT dropped). All drops are hasTable-guarded so this is a no-op on a fresh DB (where
 * the stubbed TCG migrations never created these tables).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const TCG_TABLES = [
  // children that FK into user_cards — must drop before user_cards
  'tcg_expeditions',
  'tcg_lend_contracts',
  'tcg_pvp_sessions',
  'tcg_trade_offers',
  'tcg_user_loadouts',
  // the table those reference
  'user_cards',
  // remaining orphans (FK only to users, which is preserved) — any order
  'card_data',
  'card_trades',
  'rarity',
  'tcg_abilities',
  'tcg_catalog_signatures',
  'tcg_featured_daily',
  'tcg_fusion_pity',
  'tcg_pve_progress',
  'tcg_pvp_cooldowns',
  'tcg_pvp_rank',
  'tcg_seasons',
  'tcg_set_title_unlocks',
  'tcg_shop_server_daily',
  'tcg_shop_user_daily',
  'tcg_tier_boss_pool',
  'user_wallets',
];

exports.up = async function up(knex) {
  for (const table of TCG_TABLES) {
    await knex.schema.dropTableIfExists(table);
  }
};

/**
 * Reversal does NOT recreate the TCG schema/data — TCG was intentionally removed. To restore,
 * import the TCG-only backup dump taken before this migration.
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  throw new Error(
    'Cannot recreate the orphaned TCG tables — the TCG feature was removed. ' +
      'Restore from f95bot_tcg_tables_backup_*.sql (or the full backup) if you need this data back.',
  );
};
