/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('xp_settings').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('xp_settings', (table) => {
				table.bigInteger('guildId').primary().notNullable();
				table.integer('messages_per_xp').notNullable().defaultTo(3);
				table.bigInteger('min_xp_per_gain').notNullable().defaultTo(1);
				table.bigInteger('max_xp_per_gain').notNullable().defaultTo(5);
				table.float('weekend_multiplier').notNullable().defaultTo(2);
				table.string('weekend_days').notNullable().defaultTo('sat,sun');
				table.boolean('double_xp_enabled').notNullable().defaultTo(false);
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('xp_settings');
};
