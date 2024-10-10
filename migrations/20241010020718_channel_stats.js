/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('channel_stats').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('channel_stats', (table) => {
				table.bigIncrements('id').primary();
				table.bigInteger('channel_id').notNullable();
				table.string('month_day').notNullable();
				table.bigInteger('total').notNullable();
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('channel_stats');
};
