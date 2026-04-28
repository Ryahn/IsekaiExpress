exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE char_seasons
    MODIFY COLUMN status ENUM('active', 'closed', 'complete') NOT NULL DEFAULT 'active'
  `);

  await knex.schema.createTable('char_vote_blocklist', (t) => {
    t.increments('id').primary();
    t.string('char_name_norm', 100).notNullable();
    t.string('game_name_norm', 100).notNullable();
    t.string('char_name', 100).notNullable();
    t.string('game_name', 100).notNullable();
    t.integer('source_submission_id').unsigned().nullable()
      .references('id').inTable('char_submissions').onDelete('CASCADE');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['char_name_norm', 'game_name_norm']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('char_vote_blocklist');
  await knex.raw(`
    ALTER TABLE char_seasons
    MODIFY COLUMN status ENUM('active', 'closed') NOT NULL DEFAULT 'active'
  `);
};
