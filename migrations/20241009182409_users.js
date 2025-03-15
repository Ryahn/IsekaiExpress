/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('users').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('users', (table) => {
				table.bigIncrements('id').primary();
				table.string('username').notNullable();
				table.bigInteger('discord_id').notNullable();
				table.tinyint('is_admin').defaultTo(0)
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTableIfExists('users');
};
