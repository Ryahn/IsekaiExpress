/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('card_data').then(function(exists) {
		if (exists) {
			return knex.schema.hasColumn('card_data', 'stars').then(function(columnExists) {
				if (!columnExists) {
					return knex.schema.table('card_data', function(table) {
						table.integer('stars').defaultTo(1);
						table.string('level').defaultTo(1);
						table.string('power').defaultTo(0);
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
			return knex.schema.hasColumn('card_data', 'stars').then(function(columnExists) {
				if (columnExists) {
					return knex.schema.table('card_data', function(table) {
						table.dropColumn('stars');
						table.dropColumn('level');
						table.dropColumn('power');
					});
				}
			});
		}
	});
};
