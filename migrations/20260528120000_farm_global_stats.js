/**
 * Farm: global aggregate counters for public stats (backfilled from farm_xp_log where possible).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
	const has = await knex.schema.hasTable('farm_global_stats');
	if (!has) {
		await knex.schema.createTable('farm_global_stats', (table) => {
			table.tinyint('id').unsigned().primary();
			table.bigInteger('total_harvest_units').unsigned().notNullable().defaultTo(0);
			table.bigInteger('total_plant_actions').unsigned().notNullable().defaultTo(0);
			table.bigInteger('total_shop_seed_units_bought').unsigned().notNullable().defaultTo(0);
			table.bigInteger('total_seed_units_bought_while_planting').unsigned().notNullable().defaultTo(0);
			table.bigInteger('total_crop_units_sold').unsigned().notNullable().defaultTo(0);
			table.bigInteger('total_land_expansions').unsigned().notNullable().defaultTo(0);
			table.dateTime('updated_at').nullable();
		});
		await knex('farm_global_stats').insert({
			id: 1,
			total_harvest_units: 0,
			total_plant_actions: 0,
			total_shop_seed_units_bought: 0,
			total_seed_units_bought_while_planting: 0,
			total_crop_units_sold: 0,
			total_land_expansions: 0,
			updated_at: knex.fn.now(),
		});
	}

	const hasLog = await knex.schema.hasTable('farm_xp_log');
	if (!has) {
		return;
	}

	const harvestRow = await knex('farm_xp_log')
		.where({ source: 'harvest' })
		.select(knex.raw('COALESCE(SUM(amount), 0) AS s'))
		.first();
	const plantRow = await knex('farm_xp_log')
		.where({ source: 'plant' })
		.count('* AS c')
		.first();
	const expandRow = await knex('farm_xp_log')
		.where({ source: 'expand' })
		.count('* AS c')
		.first();

	const totalHarvest = harvestRow ? Number(Object.values(harvestRow)[0] || 0) : 0;
	const totalPlant = plantRow ? Number(Object.values(plantRow)[0] || 0) : 0;
	const totalExpand = expandRow ? Number(Object.values(expandRow)[0] || 0) : 0;

	await knex('farm_global_stats')
		.where({ id: 1 })
		.update({
			total_harvest_units: totalHarvest,
			total_plant_actions: totalPlant,
			total_land_expansions: totalExpand,
			updated_at: knex.fn.now(),
		});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
	const has = await knex.schema.hasTable('farm_global_stats');
	if (has) {
		await knex.schema.dropTable('farm_global_stats');
	}
};
