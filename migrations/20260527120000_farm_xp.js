/**
 * Farm XP: balance, daily conversion tracking (UTC+7), log table, backfill from legacy experience.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
	const hasProfiles = await knex.schema.hasTable('farm_profiles');
	if (hasProfiles) {
		const hasFarmXp = await knex.schema.hasColumn('farm_profiles', 'farm_xp');
		if (!hasFarmXp) {
			await knex.schema.alterTable('farm_profiles', (table) => {
				table.integer('farm_xp').unsigned().notNullable().defaultTo(0);
				table.integer('farm_xp_converted_today').unsigned().notNullable().defaultTo(0);
				table.string('farm_xp_conversion_day_key', 10).nullable();
			});
			await knex('farm_profiles').update({
				farm_xp: knex.raw('GREATEST(COALESCE(farm_xp, 0), COALESCE(experience, 0) * 10)'),
			});
		}
	}

	const hasLog = await knex.schema.hasTable('farm_xp_log');
	if (!hasLog) {
		await knex.schema.createTable('farm_xp_log', (table) => {
			table.bigIncrements('id').primary();
			table.string('discord_user_id', 32).notNullable().index();
			table.string('event_type', 16).notNullable();
			table.integer('amount').unsigned().notNullable();
			table.string('source', 32).notNullable();
			table.integer('gold_gained').unsigned().nullable();
			table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
		});
	}
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
	const hasLog = await knex.schema.hasTable('farm_xp_log');
	if (hasLog) {
		await knex.schema.dropTable('farm_xp_log');
	}
	const hasProfiles = await knex.schema.hasTable('farm_profiles');
	if (!hasProfiles) return;
	const hasFarmXp = await knex.schema.hasColumn('farm_profiles', 'farm_xp');
	if (!hasFarmXp) return;
	await knex.schema.alterTable('farm_profiles', (table) => {
		table.dropColumn('farm_xp');
		table.dropColumn('farm_xp_converted_today');
		table.dropColumn('farm_xp_conversion_day_key');
	});
};
