exports.up = async (knex) => {
  await knex.schema.createTable('char_submissions', (t) => {
    t.increments('id').primary();
    t.string('discord_user_id', 20).notNullable();
    t.string('username', 100).notNullable();
    t.string('avatar', 200).nullable();
    t.string('char_name', 100).notNullable();
    t.string('game_name', 100).notNullable();
    t.string('image_filename', 200).notNullable();
    t.enu('status', ['pending', 'approved']).defaultTo('pending');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('char_votes', (t) => {
    t.increments('id').primary();
    t.integer('submission_id').unsigned().notNullable()
      .references('id').inTable('char_submissions').onDelete('CASCADE');
    t.string('discord_user_id', 20).notNullable();
    t.enu('vote_type', ['up', 'down']).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['submission_id', 'discord_user_id']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('char_votes');
  await knex.schema.dropTableIfExists('char_submissions');
};
