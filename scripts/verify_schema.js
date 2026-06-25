/**
 * Schema health check. Connects through the existing knex config (database/knex.js) and verifies
 * that critical tables and the columns the repositories actually read/write exist.
 *
 * It checks CODE EXPECTATIONS, which is the real runtime contract. In several legacy tables the
 * migrations have drifted from what the code uses, so this intentionally validates against the
 * code, not against any single migration. See database/README.md.
 *
 * Exit code 0 = all required tables/columns present. Non-zero = something is missing or the DB
 * is unreachable. Run with: npm run verify:schema
 *
 * NOTE: column-level only. Index and foreign-key correctness still require manual inspection
 * (see the "Known high-priority drift" section in database/README.md).
 */
const db = require('../database/knex');
const config = require('../config');

/** Tables with a fixed required column set. */
const REQUIRED = {
  users: ['id', 'discord_id', 'username'],
  user_xp: ['user_id', 'xp', 'level', 'message_count'],
  user_guild_message_counts: ['guild_id', 'user_id', 'message_count'],
  command_settings: ['name', 'hash', 'channel_id', 'category', 'created_at', 'updated_at'],
  commands: ['hash', 'content', 'usage'],
  app_state: ['id', 'custom_commands_revision'],
  caged_users: ['discord_id', 'expires', 'caged_by_user', 'caged_by_id', 'created_at', 'reason', 'role_id'],
  warnings: ['warn_id', 'warn_user_id', 'warn_user', 'warn_by_user', 'warn_by_id', 'warn_reason', 'created_at', 'updated_at'],
  bans: ['discord_id', 'username', 'reason', 'method', 'banned_by_id', 'banned_by_user', 'created_at'],
  afk_users: ['user_id', 'guild_id', 'message', 'timestamp'],
  channel_stats: ['channel_id', 'channel_name', 'month_day', 'total'],
  Guilds: ['guildId', 'guildOwnerId'],
  GuildConfigurable: ['guildId', 'xp_enabled', 'warning_enabled', 'image_archive_enabled', 'level_up_enabled', 'level_up_channel'],
  image_review_approvals: ['guild_id', 'user_id', 'approved_by', 'approved_at'],
  pending_invites: ['id', 'status', 'reviewed_by', 'queue_message_id', 'created_at'],
  pending_image_reviews: ['id', 'status', 'reviewed_by', 'queue_message_id', 'home_guild_id', 'author_id'],
  image_text_blacklist: ['id', 'pattern', 'pattern_type', 'added_by', 'added_at'],
  image_hash_blacklist: ['id', 'phash', 'description', 'added_by', 'added_at'],
  attention_requests: ['id', 'status', 'reviewed_by', 'queue_message_id', 'queue_channel_id', 'resolved_at'],
  // NOTE: dmca/games/uploaders are intentionally NOT checked — confirmed absent from production
  // and unreferenced by current code (legacy/web tables). Snapshots are historical only.
};

/** xp_settings is checked specially: the code accepts EITHER a guild-scoped (guildId) or a legacy
 *  global (id) primary key, but always needs these value columns. */
const XP_SETTINGS_VALUE_COLS = [
  'messages_per_xp',
  'min_xp_per_gain',
  'max_xp_per_gain',
  'weekend_multiplier',
  'weekend_days',
  'double_xp_enabled',
  'message_xp_cooldown_seconds',
];

/**
 * Best-effort detection of the dangerous user_xp identity mismatch. The code writes Discord
 * snowflakes (strings) into user_xp.user_id and joins user_xp.user_id = users.discord_id, so a
 * migration-shaped table (integer user_id + FK to users.id) cannot accept those inserts.
 * Returns { problems, notes }. Never throws (information_schema differences are reported, not faked).
 */
async function checkUserXpIdentity(dbName) {
  const problems = [];
  const notes = [];
  try {
    if (!dbName) {
      notes.push('user_xp identity: skipped (could not resolve database name).');
      return { problems, notes };
    }
    const col = await db('information_schema.COLUMNS')
      .select('DATA_TYPE')
      .where({ TABLE_SCHEMA: dbName, TABLE_NAME: 'user_xp', COLUMN_NAME: 'user_id' })
      .first();
    if (!col) {
      notes.push('user_xp identity: user_id column not found (table missing?).');
      return { problems, notes };
    }
    const dataType = String(col.DATA_TYPE || '').toLowerCase();
    const isIntegerType = ['bigint', 'int', 'integer', 'smallint', 'mediumint'].includes(dataType);

    const fk = await db('information_schema.KEY_COLUMN_USAGE')
      .where({
        TABLE_SCHEMA: dbName,
        TABLE_NAME: 'user_xp',
        COLUMN_NAME: 'user_id',
        REFERENCED_TABLE_NAME: 'users',
      })
      .first();

    if (fk) {
      problems.push(
        'user_xp.user_id has a FOREIGN KEY to users — but the code stores Discord snowflakes and ' +
          'joins on users.discord_id. This FK will reject XP inserts. See database/README.md.',
      );
    }
    if (isIntegerType) {
      problems.push(
        `user_xp.user_id is an integer type (${dataType}) — the code writes Discord snowflakes and ` +
          'joins user_xp.user_id = users.discord_id (a string). Verify against production.',
      );
    }
    notes.push(`user_xp.user_id DATA_TYPE = ${dataType}${fk ? ', FK→users present' : ', no users FK'}.`);
  } catch (e) {
    notes.push('user_xp identity: could not inspect information_schema — ' + (e && e.message ? e.message : String(e)));
  }
  return { problems, notes };
}

async function main() {
  const problems = [];

  for (const [table, columns] of Object.entries(REQUIRED)) {
    const exists = await db.schema.hasTable(table);
    if (!exists) {
      problems.push(`MISSING TABLE: ${table}`);
      continue;
    }
    for (const col of columns) {
      const has = await db.schema.hasColumn(table, col);
      if (!has) problems.push(`MISSING COLUMN: ${table}.${col}`);
    }
  }

  // xp_settings special handling
  if (!(await db.schema.hasTable('xp_settings'))) {
    problems.push('MISSING TABLE: xp_settings');
  } else {
    const hasGuildId = await db.schema.hasColumn('xp_settings', 'guildId');
    const hasId = await db.schema.hasColumn('xp_settings', 'id');
    if (!hasGuildId && !hasId) {
      problems.push('xp_settings: needs a primary key column (guildId or id) — found neither');
    }
    for (const col of XP_SETTINGS_VALUE_COLS) {
      const has = await db.schema.hasColumn('xp_settings', col);
      if (!has) problems.push(`MISSING COLUMN: xp_settings.${col}`);
    }
    console.log(`xp_settings key shape: ${hasGuildId ? 'guild-scoped (guildId)' : ''}${hasId ? ' legacy-global (id)' : ''}`.trim());
  }

  // user_xp identity / FK (dangerous mismatch)
  const identity = await checkUserXpIdentity(config.mysql && config.mysql.database);
  for (const note of identity.notes) console.log(note);
  problems.push(...identity.problems);

  // Guilds owner column: code's createGuild now writes `guildOwnerId` (required above). A stray
  // legacy `owner_id` column is harmless but worth noting; it is NOT a failure.
  if (await db.schema.hasTable('Guilds')) {
    if (await db.schema.hasColumn('Guilds', 'owner_id')) {
      console.warn('NOTE: Guilds has a legacy `owner_id` column (unused; code writes `guildOwnerId`).');
    }
  }

  // users.discord_id is the external identity key (getLeaderboard joins user_xp.user_id =
  // users.discord_id; checkUser upserts by discord_id). It must be unique and have a UNIQUE index.
  // Both are now enforced as hard failures (dedupe + index migration shipped).
  if (config.mysql && config.mysql.database && (await db.schema.hasTable('users'))) {
    try {
      const dups = await db('users')
        .select('discord_id')
        .count('* as c')
        .groupBy('discord_id')
        .havingRaw('count(*) > 1');
      if (dups.length > 0) {
        problems.push(`users has ${dups.length} duplicate discord_id group(s) — dedupe required (see database/README.md).`);
      }
      const uniq = await db('information_schema.STATISTICS')
        .where({
          TABLE_SCHEMA: config.mysql.database,
          TABLE_NAME: 'users',
          COLUMN_NAME: 'discord_id',
          NON_UNIQUE: 0,
        })
        .first();
      if (!uniq) {
        problems.push('users.discord_id has no UNIQUE index (expected `users_discord_id_unique`; run migrations).');
      } else {
        console.log('users.discord_id unique index: present.');
      }
    } catch (e) {
      problems.push('users.discord_id integrity check failed to run: ' + (e && e.message ? e.message : String(e)));
    }
  }

  if (problems.length) {
    console.error(`\n❌ Schema verification FAILED (${problems.length} issue(s)):`);
    for (const p of problems) console.error('  - ' + p);
    console.error('\nSee database/README.md. Migrations are authoritative; run `npm run migrate`.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ Schema verification passed: all required tables and code-required columns present.');
    console.log('   (Indexes and foreign keys are NOT checked here — see database/README.md.)');
  }
}

main()
  .catch((err) => {
    console.error('❌ Schema verification could not run (DB unreachable or query error):');
    console.error('  ' + (err && err.message ? err.message : String(err)));
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
