/**
 * Farm minigame: optional guild channel lock for gameplay commands.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
	const has = await knex.schema.hasTable('farm_guild_settings');
	if (!has) return;
	const hasCol = await knex.schema.hasColumn('farm_guild_settings', 'farm_channel_id');
	if (hasCol) return;
	return knex.schema.alterTable('farm_guild_settings', (table) => {
		table.string('farm_channel_id', 32).nullable();
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
	const has = await knex.schema.hasTable('farm_guild_settings');
	if (!has) return;
	const hasCol = await knex.schema.hasColumn('farm_guild_settings', 'farm_channel_id');
	if (!hasCol) return;
	return knex.schema.alterTable('farm_guild_settings', (table) => {
		table.dropColumn('farm_channel_id');
	});
};
