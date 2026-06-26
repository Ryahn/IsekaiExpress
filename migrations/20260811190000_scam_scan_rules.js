function normalizeScamScanText(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalized staff-managed image scam scan text rules.
 * Existing image_text_blacklist keyword/domain rows are copied for compatibility.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('scam_scan_rules'))) {
    await knex.schema.createTable('scam_scan_rules', (table) => {
      table.increments('id').primary();
      table.string('type', 32).notNullable().defaultTo('keyword');
      table.string('pattern', 255).notNullable();
      table.string('normalized_pattern', 255).notNullable();
      table.string('severity', 32).notNullable().defaultTo('review');
      table.boolean('enabled').notNullable().defaultTo(true);
      table.text('notes').nullable();
      table.string('created_by', 20).nullable();
      table.string('updated_by', 20).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['enabled'], 'scam_scan_rules_enabled_idx');
      table.index(['type'], 'scam_scan_rules_type_idx');
      table.index(['normalized_pattern'], 'scam_scan_rules_normalized_pattern_idx');
      table.unique(['type', 'normalized_pattern'], 'scam_scan_rules_type_pattern_unique');
    });
  }

  if (await knex.schema.hasTable('image_text_blacklist')) {
    const rows = await knex('image_text_blacklist')
      .select('pattern', 'pattern_type', 'added_by')
      .whereIn('pattern_type', ['keyword', 'domain'])
      .orderBy('id', 'asc');

    for (const row of rows) {
      const normalized = normalizeScamScanText(row.pattern);
      if (!normalized) continue;
      const type = row.pattern_type === 'domain' ? 'domain' : 'keyword';
      const exists = await knex('scam_scan_rules')
        .where({ type, normalized_pattern: normalized })
        .first();
      if (exists) continue;
      await knex('scam_scan_rules').insert({
        type,
        pattern: row.pattern,
        normalized_pattern: normalized,
        severity: 'auto',
        enabled: true,
        notes: 'Migrated from image_text_blacklist',
        created_by: row.added_by || null,
        updated_by: row.added_by || null,
      });
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('scam_scan_rules');
};
