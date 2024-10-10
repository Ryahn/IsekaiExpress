/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.alterTable('caged_users', (table) => {
		table.text('old_roles').nullable().alter();
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.alterTable('caged_users', (table) => {
		table.text('old_roles').notNullable().alter();
	});
};
