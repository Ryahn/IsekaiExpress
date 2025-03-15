/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('bans').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('bans', (table) => {
				table.bigIncrements('id').primary();
				table.bigInteger('discord_id').notNullable();
				table.string('username').notNullable();
				table.text('reason', 'longtext').notNullable();
				table.string('banned_by_id').notNullable();
				table.string('banned_by_username').notNullable();
				table.string('created_at').notNullable();
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTableIfExists('bans');
};
