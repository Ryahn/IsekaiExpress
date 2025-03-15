/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('audit').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('audit', (table) => {
				table.bigIncrements('id').primary();
				table.bigInteger('discord_id').notNullable();
				table.text('action', 'longtext').notNullable();
				table.string('method').notNullable();
				table.integer('timestamp').notNullable();
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTableIfExists('audit');
};
