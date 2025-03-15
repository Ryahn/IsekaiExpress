/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('Guilds').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('Guilds', (table) => {
				table.bigInteger('guildId').primary().notNullable();
				table.bigInteger('guildOwnerId').notNullable();
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTableIfExists('Guilds');
};
