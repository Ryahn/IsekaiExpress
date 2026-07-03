/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('moderation_action_logs');
  if (exists) return;

  await knex.schema.createTable('moderation_action_logs', (table) => {
    table.increments('id').primary();
    table.string('guild_id', 32).notNullable();
    table.string('action_type', 32).notNullable();
    table.string('target_user_id', 32).notNullable();
    table.string('target_username', 128).nullable();
    table.string('target_display_name', 128).nullable();
    table.string('moderator_user_id', 32).nullable();
    table.string('moderator_username', 128).nullable();
    table.string('moderator_display_name', 128).nullable();
    table.string('channel_id', 32).nullable();
    table.string('source_message_id', 32).nullable();
    table.text('deleted_content').nullable();
    table.text('reason').nullable();
    table.string('audit_log_entry_id', 32).nullable().unique();
    table.string('source', 32).notNullable().defaultTo('discord_audit');
    table.text('metadata_json').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['guild_id', 'created_at']);
    table.index(['action_type']);
    table.index(['target_user_id']);
    table.index(['moderator_user_id']);
    table.index(['guild_id', 'target_user_id', 'action_type', 'created_at'], 'mod_action_logs_dedup_idx');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('moderation_action_logs');
};
