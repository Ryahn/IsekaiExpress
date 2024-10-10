/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('afk_users').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('afk_users', (table) => {
				table.bigIncrements('id').primary();
				table.bigInteger('user_id').notNullable();
				table.bigInteger('guild_id').notNullable();
				table.text('message', 'longtext').notNullable();
				table.bigInteger('timestamp').notNullable();
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('afk_users');
};
