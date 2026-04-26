/**
 * Invite allowlist queue, black/whitelist, image review, per-guild message counts.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const has = async (t) => knex.schema.hasTable(t);
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));

  if (!(await has('blacklisted_guilds'))) {
    await knex.schema.createTable('blacklisted_guilds', (table) => {
      table.increments('id').primary();
      table.string('guild_id', 20).notNullable().unique();
      table.string('guild_name', 100).nullable();
      table.text('reason').nullable();
      table.string('added_by', 20).nullable();
      table.timestamp('added_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await has('blacklisted_invites'))) {
    await knex.schema.createTable('blacklisted_invites', (table) => {
      table.increments('id').primary();
      table.string('code', 50).notNullable().unique();
      table.string('resolved_guild_id', 20).nullable();
      table.text('reason').nullable();
      table.string('added_by', 20).nullable();
      table.timestamp('added_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await has('whitelisted_guilds'))) {
    await knex.schema.createTable('whitelisted_guilds', (table) => {
      table.increments('id').primary();
      table.string('home_guild_id', 20).notNullable();
      table.string('target_guild_id', 20).notNullable();
      table.string('guild_name', 100).nullable();
      table.string('approved_by', 20).nullable();
      table.timestamp('approved_at').defaultTo(knex.fn.now());
      table.unique(['home_guild_id', 'target_guild_id']);
    });
  }

  if (!(await has('whitelisted_invites'))) {
    await knex.schema.createTable('whitelisted_invites', (table) => {
      table.increments('id').primary();
      table.string('home_guild_id', 20).notNullable();
      table.string('code', 50).notNullable();
      table.string('resolved_guild_id', 20).nullable();
      table.string('approved_by', 20).nullable();
      table.timestamp('approved_at').defaultTo(knex.fn.now());
      table.unique(['home_guild_id', 'code']);
    });
  }

  if (!(await has('pending_invites'))) {
    await knex.schema.createTable('pending_invites', (table) => {
      table.increments('id').primary();
      table.string('home_guild_id', 20).notNullable();
      table.string('author_id', 20).notNullable();
      table.string('channel_id', 20).notNullable();
      table.string('invite_code', 50).notNullable();
      table.string('resolved_guild_id', 20).nullable();
      table.string('resolved_guild_name', 100).nullable();
      table.string('queue_message_id', 20).nullable();
      table
        .enum('status', ['pending', 'approved', 'blacklisted', 'expired'])
        .notNullable()
        .defaultTo('pending');
      table.string('reviewed_by', 20).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await has('user_guild_message_counts'))) {
    await knex.schema.createTable('user_guild_message_counts', (table) => {
      table.string('guild_id', 20).notNullable();
      table.string('user_id', 20).notNullable();
      table.integer('message_count').unsigned().notNullable().defaultTo(0);
      table.primary(['guild_id', 'user_id']);
    });
  }

  if (!(await has('image_review_approvals'))) {
    await knex.schema.createTable('image_review_approvals', (table) => {
      table.string('guild_id', 20).notNullable();
      table.string('user_id', 20).notNullable();
      table.timestamp('approved_at').defaultTo(knex.fn.now());
      table.string('approved_by', 20).nullable();
      table.primary(['guild_id', 'user_id']);
    });
  }

  if (!(await has('pending_image_reviews'))) {
    await knex.schema.createTable('pending_image_reviews', (table) => {
      table.increments('id').primary();
      table.string('home_guild_id', 20).notNullable();
      table.string('author_id', 20).notNullable();
      table.string('channel_id', 20).notNullable();
      table.string('attachment_url', 500).notNullable();
      table.text('message_content').nullable();
      table.string('queue_message_id', 20).nullable();
      table
        .enum('status', ['pending', 'approved', 'banned'])
        .notNullable()
        .defaultTo('pending');
      table.string('reviewed_by', 20).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  if (await has('GuildConfigurable')) {
    const cols = [
      ['image_review_channel_id', (t) => t.string('image_review_channel_id', 20).nullable()],
      ['invite_queue_channel_id', (t) => t.string('invite_queue_channel_id', 20).nullable()],
      ['min_account_age_days', (t) => t.integer('min_account_age_days').unsigned().nullable()],
      ['min_join_age_days', (t) => t.integer('min_join_age_days').unsigned().nullable()],
      ['min_messages_for_image_trust', (t) => t.integer('min_messages_for_image_trust').unsigned().nullable()],
    ];
    for (const [name, fn] of cols) {
      if (!(await hasCol('GuildConfigurable', name))) {
        await knex.schema.alterTable('GuildConfigurable', (table) => {
          fn(table);
        });
      }
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('pending_image_reviews');
  await knex.schema.dropTableIfExists('image_review_approvals');
  await knex.schema.dropTableIfExists('user_guild_message_counts');
  await knex.schema.dropTableIfExists('pending_invites');
  await knex.schema.dropTableIfExists('whitelisted_invites');
  await knex.schema.dropTableIfExists('whitelisted_guilds');
  await knex.schema.dropTableIfExists('blacklisted_invites');
  await knex.schema.dropTableIfExists('blacklisted_guilds');
  const hasCol = async (table, col) =>
    knex.schema.hasTable(table).then((ex) => (ex ? knex.schema.hasColumn(table, col) : false));
  if (await knex.schema.hasTable('GuildConfigurable')) {
    for (const col of [
      'image_review_channel_id',
      'invite_queue_channel_id',
      'min_account_age_days',
      'min_join_age_days',
      'min_messages_for_image_trust',
    ]) {
      if (await hasCol('GuildConfigurable', col)) {
        await knex.schema.alterTable('GuildConfigurable', (t) => t.dropColumn(col));
      }
    }
  }
};
