exports.up = async (knex) => {
  await knex.schema.createTable('char_seasons', (t) => {
    t.increments('id').primary();
    t.string('name', 100).notNullable();
    t.enu('status', ['active', 'closed']).defaultTo('active');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('closed_at').nullable();
  });

  await knex.schema.alterTable('char_submissions', (t) => {
    t.integer('season_id').unsigned().nullable()
      .references('id').inTable('char_seasons').onDelete('SET NULL');
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('char_submissions', (t) => {
    t.dropColumn('season_id');
  });
  await knex.schema.dropTableIfExists('char_seasons');
};
