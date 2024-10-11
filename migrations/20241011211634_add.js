/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('caged_users').then(function(exists) {
    if (exists) {
		return knex.schema.hasColumn('caged_users', 'role_id').then(function(columnExists) {
			if (!columnExists) {
				return knex.schema.table('caged_users', function(table) {
					table.string('role_id');
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
	return knex.schema.hasTable('caged_users').then(function(exists) {
		if (exists) {
			return knex.schema.hasColumn('caged_users', 'role_id').then(function(columnExists) {
				if (columnExists) {
					return knex.schema.table('caged_users', function(table) {
						table.dropColumn('role_id');
					});
				}
			});
		}
	});
};
