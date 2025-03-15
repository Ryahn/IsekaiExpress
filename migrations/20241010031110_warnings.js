/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('warnings').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('warnings', (table) => {
				table.bigInteger('warn_id').primary().notNullable();
				table.bigInteger('warn_user_id').notNullable();
				table.string('warn_user').notNullable();
				table.string('warn_by_user').notNullable();
				table.bigInteger('warn_by_id').notNullable();
				table.text('warn_reason', 'longtext').notNullable();
				table.bigInteger('created_at').notNullable();
				table.bigInteger('updated_at').notNullable();
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTableIfExists('warnings');
};
