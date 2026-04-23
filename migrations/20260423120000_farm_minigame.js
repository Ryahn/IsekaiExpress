/**
 * Farm minigame: guild settings, per-user profiles, global price history points.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
	const hasGuild = await knex.schema.hasTable('farm_guild_settings');
	if (!hasGuild) {
		await knex.schema.createTable('farm_guild_settings', (table) => {
			table.string('guild_id', 32).primary();
			table.string('prefix', 3).notNullable().defaultTo('h');
			table.boolean('minigame_enabled').notNullable().defaultTo(true);
			table.json('user_enabled_json').nullable();
			table.json('role_shop_json').nullable();
		});
	}

	const hasProfiles = await knex.schema.hasTable('farm_profiles');
	if (!hasProfiles) {
		await knex.schema.createTable('farm_profiles', (table) => {
			table.string('discord_user_id', 32).primary();
			table.bigInteger('money').unsigned().notNullable().defaultTo(5000);
			table.integer('experience').notNullable().defaultTo(0);
			table.integer('land_slots').notNullable().defaultTo(10);
			table.json('inventory').notNullable();
			table.json('current_crop').nullable();
			table.dateTime('planted_at').nullable();
			table.dateTime('last_login').nullable();
		});
	}

	const hasMeta = await knex.schema.hasTable('farm_price_meta');
	if (!hasMeta) {
		await knex.schema.createTable('farm_price_meta', (table) => {
			table.tinyint('id').unsigned().primary();
			table.string('last_period_key', 64).nullable();
		});
		await knex('farm_price_meta').insert({ id: 1, last_period_key: null });
	}

	const hasPoints = await knex.schema.hasTable('farm_price_points');
	if (!hasPoints) {
		await knex.schema.createTable('farm_price_points', (table) => {
			table.string('period_key', 64).notNullable();
			table.string('crop_name', 64).notNullable();
			table.decimal('buy_price', 12, 2).notNullable();
			table.decimal('sell_price', 12, 2).notNullable();
			table.primary(['period_key', 'crop_name']);
			table.index(['crop_name', 'period_key']);
		});
	}
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
	await knex.schema.dropTableIfExists('farm_price_points');
	await knex.schema.dropTableIfExists('farm_price_meta');
	await knex.schema.dropTableIfExists('farm_profiles');
	await knex.schema.dropTableIfExists('farm_guild_settings');
};
