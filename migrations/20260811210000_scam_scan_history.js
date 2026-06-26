exports.up = async function (knex) {
  const hasHistory = await knex.schema.hasTable('scam_scan_history');
  if (!hasHistory) {
    await knex.schema.createTable('scam_scan_history', (table) => {
      table.increments('id').primary();
      table.string('guild_id', 32).notNullable();
      table.string('channel_id', 32).notNullable();
      table.string('message_id', 32).notNullable();
      table.string('attachment_id', 64).nullable();
      table.integer('attachment_index').notNullable().defaultTo(0);
      table.string('attachment_url_hash', 64).nullable();
      table.string('user_id', 32).notNullable();
      table.boolean('is_staff_or_mod').notNullable().defaultTo(false);
      table.string('status', 24).notNullable();
      table.string('reason_code', 64).nullable();
      table.string('failure_stage', 32).nullable();
      table.boolean('manual_review_required').notNullable().defaultTo(false);
      table.boolean('manual_review_queued').notNullable().defaultTo(false);
      table.text('matched_rule_ids').nullable();
      table.text('matched_rule_types').nullable();
      table.text('matched_hash_ids').nullable();
      table.string('severity', 24).nullable();
      table.integer('image_bytes').nullable();
      table.integer('image_width').nullable();
      table.integer('image_height').nullable();
      table.string('image_format', 32).nullable();
      table.integer('timing_download_ms').nullable();
      table.integer('timing_preprocess_ms').nullable();
      table.integer('timing_ocr_ms').nullable();
      table.integer('timing_rules_ms').nullable();
      table.integer('timing_phash_ms').nullable();
      table.integer('timing_total_ms').nullable();
      table.string('ocr_preview', 500).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['created_at']);
      table.index(['status']);
      table.index(['reason_code']);
      table.index(['failure_stage']);
      table.index(['guild_id', 'created_at']);
      table.index(['manual_review_required']);
      table.index(['manual_review_queued']);
      table.index(['message_id']);
      table.index(['user_id', 'created_at']);
    });
  }

  const hasRuleHits = await knex.schema.hasTable('scam_scan_history_rule_hits');
  if (!hasRuleHits) {
    await knex.schema.createTable('scam_scan_history_rule_hits', (table) => {
      table.increments('id').primary();
      table.integer('scan_history_id').unsigned().notNullable();
      table.string('rule_id', 64).nullable();
      table.string('rule_type', 32).nullable();
      table.string('severity', 24).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['scan_history_id']);
      table.index(['rule_id']);
      table.index(['rule_type']);
      table.index(['created_at']);
      table.foreign('scan_history_id')
        .references('id')
        .inTable('scam_scan_history')
        .onDelete('CASCADE');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('scam_scan_history_rule_hits');
  await knex.schema.dropTableIfExists('scam_scan_history');
};
