/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('card_data').then(function(exists) {
		if (exists) {
			knex.schema.hasColumn('card_data', 'uuid').then(function(exists) {
				if (!exists) {
					return knex.schema.table('card_data', function(table) {
						table.string('uuid').unique();
					});
				}
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.hasTable('card_data').then(function(exists) {
		if (exists) {
			knex.schema.hasColumn('card_data', 'uuid').then(function(exists) {
				if (exists) {
					return knex.schema.table('card_data', function(table) {
						table.dropColumn('uuid');
					});
				}
			});
		}
	});
};
