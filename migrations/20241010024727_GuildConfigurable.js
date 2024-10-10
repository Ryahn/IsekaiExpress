/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.hasTable('GuildConfigurable').then((exists) => {
		if(!exists) {
			return knex.schema.createTable('GuildConfigurable', (table) => {
				table.bigInteger('guildId').primary().notNullable();
				table.string('cmdPrefix').nullable().defaultTo('o!');
				table.string('modLogId').nullable();
				table.string('subReddit').nullable();
				table.string('guildWelcome').nullable();
				table.text('guildWelcomeMsg', 'longtext').nullable();
				table.integer('guildVolume').nullable().defaultTo(100);
				table.string('guildLanguage', 10).defaultTo('en_EN');
			});
		}
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.dropTable('GuildConfigurable');
};