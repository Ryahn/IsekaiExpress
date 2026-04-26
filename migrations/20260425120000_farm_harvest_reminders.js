/**
 * Farm: harvest-ready ping flags, last-guild context for @mentions, opt-out.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
	const has = await knex.schema.hasTable('farm_profiles');
	if (!has) return;
	const hasPinged = await knex.schema.hasColumn('farm_profiles', 'maturity_pinged');
	if (hasPinged) return;
	return knex.schema.alterTable('farm_profiles', (table) => {
		table.boolean('maturity_pinged').notNullable().defaultTo(false);
		table.string('last_farm_guild_id', 32).nullable();
		table.boolean('harvest_reminders_enabled').notNullable().defaultTo(true);
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
	const has = await knex.schema.hasTable('farm_profiles');
	if (!has) return;
	const hasPinged = await knex.schema.hasColumn('farm_profiles', 'maturity_pinged');
	if (!hasPinged) return;
	return knex.schema.alterTable('farm_profiles', (table) => {
		table.dropColumn('maturity_pinged');
		table.dropColumn('last_farm_guild_id');
		table.dropColumn('harvest_reminders_enabled');
	});
};
