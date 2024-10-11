/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('caged_users').then((exists) => {
		if(exists) {
			return knex.schema.hasColumn('caged_users', 'reason').then((columnExists) => {
				if(!columnExists) {
					return knex.schema.alterTable('caged_users', (table) => {
						table.text('reason', 'longtext').nullable();
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
	return knex.schema.alterTable('caged_users', (table) => {
		table.dropColumn('reason');
	});
};
