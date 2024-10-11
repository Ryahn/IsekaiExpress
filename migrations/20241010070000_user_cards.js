/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('user_cards').then(function(exists) {
		if (!exists) {
			return knex.schema.createTable('user_cards', function(table) {
				table.bigIncrements('user_card_id').primary();
				table.bigInteger('user_id').unsigned().references('id').inTable('users');
				table.bigInteger('card_id').unsigned().references('card_id').inTable('card_data');
				table.integer('quantity').defaultTo(1);
				table.bigInteger('updated_at');
				table.bigInteger('created_at');
				table.unique(['user_id', 'card_id']);
				table.index('quantity', 'quantity_index');
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('user_cards');
};
