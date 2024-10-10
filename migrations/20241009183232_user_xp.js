/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('user_xp').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('user_xp', (table) => {
				table.integer('user_id').primary().references('id').inTable('users');
				table.bigInteger('xp').defaultTo(0);
				table.integer('message_count').defaultTo(0);
			});
		}
	})
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('user_xp');
};
