/**
 * Tier Boss pool — seasonal assignment of tier bosses per region/tier slot.
 * Each season_key+region+tier combination has one designated member.
 * Auto-populated on first fight if not admin-set.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('tcg_tier_boss_pool'))) {
    await knex.schema.createTable('tcg_tier_boss_pool', (table) => {
      table.string('season_key', 16).notNullable().defaultTo('default');
      table.tinyint('region').unsigned().notNullable();
      table.tinyint('tier').unsigned().notNullable();
      table.string('member_discord_id', 24).notNullable();
      table.string('card_rarity', 8).notNullable().defaultTo('SR');
      table.boolean('set_by_admin').notNullable().defaultTo(false);
      table.primary(['season_key', 'region', 'tier']);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_tier_boss_pool');
};
