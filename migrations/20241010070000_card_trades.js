/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('card_trades').then(function(exists) {
		if (!exists) {
			return knex.schema.createTable('card_trades', function(table) {
				table.bigIncrements('trade_id').primary();
				table.bigInteger('sender_id').unsigned().references('id').inTable('users');
				table.bigInteger('receiver_id').unsigned().references('id').inTable('users');
				table.bigInteger('card_id').unsigned().references('card_id').inTable('card_data');
				table.bigInteger('quantity');
				table.enum('status', ['pending', 'accepted', 'rejected']).defaultTo('pending');
				table.bigInteger('updated_at');
				table.bigInteger('created_at');
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('card_trades');
};
