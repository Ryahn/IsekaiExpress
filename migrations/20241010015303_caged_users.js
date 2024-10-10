/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('caged_users').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('caged_users', (table) => {
				table.bigIncrements('id').primary();
				table.string('discord_id').notNullable();
				table.text('old_roles', 'longtext').notNullable();
				table.string('expires_at').notNullable();
				table.string('caged_by_id').notNullable();
				table.string('caged_by_user').notNullable();
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
	return knex.schema.dropTable('caged_users');
};
