/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('command_settings').then(exists => {
		if (!exists) {
			return knex.schema.createTable('command_settings', table => {
				table.bigIncrements('settings_id').primary();
				table.string('name').notNullable();
				table.string('hash').notNullable();
				table.string('channel_id').notNullable();
				table.string('category').notNullable();
				table.bigInteger('created_at');
				table.bigInteger('updated_at');
				table.unique(['hash', 'name']);
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTableIfExists('command_settings');
};
