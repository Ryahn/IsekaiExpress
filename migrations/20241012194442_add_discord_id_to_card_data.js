/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('card_data').then(function(exists) {
		if (exists) {
			return knex.schema.hasColumn('card_data', 'discord_id').then(function(columnExists) {
				if (!columnExists) {
					return knex.schema.table('card_data', function(table) {
						table.string('discord_id');
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
			return knex.schema.hasColumn('card_data', 'discord_id').then(function(columnExists) {
				if (columnExists) {
					return knex.schema.table('card_data', function(table) {
						table.dropColumn('discord_id');
					});
				}
			});
		}
	});
};
