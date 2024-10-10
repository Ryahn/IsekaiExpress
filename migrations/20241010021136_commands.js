/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('commands').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('commands', (table) => {
				table.bigIncrements('id').primary();
				table.string('hash', 32).notNullable();
				table.text('name', 'longtext').notNullable();
				table.text('content', 'longtext').nullable();
				table.bigInteger('usage').notNullable().defaultTo(0);
				table.bigInteger('created_by').notNullable();
				table.bigInteger('updated_by').nullable();
				table.bigInteger('created_at').nullable();
				table.bigInteger('updated_at').nullable();
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('commands');
};
