/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('rarity').then(function(exists) {
		if (!exists) {
			return knex.schema.createTable('rarity', function(table) {
				table.bigIncrements('rare_id').primary();
				table.string('name');
				table.string('abbreviation');
				table.float('high_chance');
				table.float('low_chance');
				table.integer('stars');
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('rarity');
};
