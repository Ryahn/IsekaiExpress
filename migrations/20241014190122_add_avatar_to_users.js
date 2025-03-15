/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('users').then(function(exists) {
		if (exists) {
			return knex.schema.hasColumn('users', 'avatar').then(function(columnExists) {
				if (!columnExists) {
					return knex.schema.table('users', function(table) {
						table.text('avatar', 'longtext').nullable();
						table.json('roles').nullable();
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
	return knex.schema.hasTable('users').then(function(exists) {
		if (exists) {
			return knex.schema.hasColumn('users', 'avatar').then(function(columnExists) {
				if (columnExists) {
					return knex.schema.table('users', function(table) {
						table.dropColumn('avatar');
						table.dropColumn('roles');
					});
				}
			});
		}
	});
};
