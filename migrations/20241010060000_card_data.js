/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('card_data').then(function(exists) {
		if (!exists) {
			return knex.schema.createTable('card_data', function(table) {
				table.bigIncrements('card_id').primary();
				table.string('name');
				table.text('description', 'longtext');
				table.text('image_url', 'longtext');
				table.string('rarity');
				table.string('class');
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
	return knex.schema.dropTableIfExists('card_data');
};
