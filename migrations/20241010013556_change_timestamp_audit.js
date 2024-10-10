/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.alterTable('audit', (table) => {
		table.bigInteger('timestamp').notNullable().alter();
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.hasTable('audit').then((exists) => {
		if(exists) {
			knex.schema.hasColumn('audit', 'timestamp').then((columnExists) => {
				if(columnExists) {
					knex.schema.alterTable('audit', (table) => {
						table.integer('timestamp').notNullable().alter();
					});
				}
			});
		}
	});
};
