/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('user_xp').then((exists) => {
		if(exists) {
			return knex.schema.hasColumn('user_xp', 'level').then((columnExists) => {
				if(!columnExists) {
					return knex.schema.table('user_xp', (table) => {
						table.integer('level').defaultTo(0);
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
	return knex.schema.table('user_xp', (table) => {
		table.dropColumn('level');
	});
};
