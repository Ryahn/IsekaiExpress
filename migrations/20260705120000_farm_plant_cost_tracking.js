/**
 * Farm: track what a user spent when planting so aborts can prorate refunds.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
	const hasProfiles = await knex.schema.hasTable('farm_profiles');
	if (!hasProfiles) return;

	const hasCash = await knex.schema.hasColumn('farm_profiles', 'planted_cash_paid');
	const hasSeeds = await knex.schema.hasColumn('farm_profiles', 'planted_seeds_from_inv');

	if (!hasCash || !hasSeeds) {
		await knex.schema.alterTable('farm_profiles', (table) => {
			if (!hasCash) {
				table.bigInteger('planted_cash_paid').unsigned().nullable();
			}
			if (!hasSeeds) {
				table.integer('planted_seeds_from_inv').unsigned().nullable();
			}
		});
	}
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
	const hasProfiles = await knex.schema.hasTable('farm_profiles');
	if (!hasProfiles) return;

	const hasCash = await knex.schema.hasColumn('farm_profiles', 'planted_cash_paid');
	const hasSeeds = await knex.schema.hasColumn('farm_profiles', 'planted_seeds_from_inv');

	if (hasCash || hasSeeds) {
		await knex.schema.alterTable('farm_profiles', (table) => {
			if (hasCash) table.dropColumn('planted_cash_paid');
			if (hasSeeds) table.dropColumn('planted_seeds_from_inv');
		});
	}
};
