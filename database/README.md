# Database

## Source of truth

**Knex migrations in `migrations/` are authoritative** for every table they define. They are
what `setup.js` and `npm run migrate` actually run, and they are applied incrementally in
production.

The hand-written `database/schemas/*.sql` snapshots were **deleted** (2026-06-25) — they had
drifted and were not used by any setup/deploy/runtime path. Migrations + `verify_schema.js` are
the only schema authority now. (`database/schemas/` still holds unrelated seed JSON and
`nginx.conf`; see `database/schemas/README.md`.) Old snapshots remain in git history.

## Initialize a fresh database

```bash
# 1. Create an empty database (name from MYSQL_DB in .env)
#    e.g. CREATE DATABASE f95bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
# 2. Set MYSQL_* in .env (see .env.example)
# 3. Run migrations (+ seeds):
npm run setup          # creates .env if missing, migrates, seeds
# or, migrations only:
npm run migrate        # npx knex migrate:latest
```

Production restores happen from a full `f95bot.sql` dump (see `docker-compose.yml` and
`scripts/reset-mysql-volume-and-restore.sh`).

**Always take a full backup before running migrations against production**, e.g.
`docker exec f95bot-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > f95bot_full_backup_$(date +%F).sql`.

## Verify schema health

```bash
npm run verify:schema  # checks the columns the running code requires; exits non-zero if any are missing
```

`scripts/verify_schema.js` connects through the existing knex config and checks that critical
tables and the columns the repositories actually read/write exist (plus `user_xp` identity and the
`users.discord_id` unique index). It checks **code expectations** — the real runtime contract.
Both production and a fresh migrated DB currently **pass**.

### Troubleshooting verify_schema failures

- **MISSING TABLE/COLUMN** — that migration hasn't run; `npm run migrate` (check `migrate:list`).
- **user_xp.user_id is an integer / has a FK to users** — the fresh-migrate shape leaked in; the
  reconcile migration `20260811140000` converts it to `varchar(21)` no-FK. Re-run migrations.
- **duplicate discord_id / missing users_discord_id_unique** — dedupe `users` then let
  `20260811170000` add the index (it refuses while duplicates exist). See the dedupe section below.
- **DB unreachable** — wrong `MYSQL_*`/host. In Docker use `MYSQL_HOST=f95bot-mysql` (in-network);
  the published host port is `127.0.0.1:3987`.

## Live schema status (verified against production, 2026-06-25)

Inspected the running production database (docker `f95bot-mysql`) via `npm run verify:schema`
and `SHOW CREATE TABLE`. Findings:

1. **`user_xp` — RESOLVED (no repair needed).** Production `user_xp.user_id` is
   `varchar(21)` with **no foreign key** to `users` (PK on `user_id`, index on `(xp,
   message_count)`, plus a `level bigint` column). This matches the code exactly (snowflake key;
   `getLeaderboard` joins `user_xp.user_id = users.discord_id`). The migration's `users.id`-FK
   shape is **not** what production runs. No repair migration is needed or written.
2. **`xp_settings` — production is the legacy GLOBAL single-row shape (`id` PK)**, with
   `message_xp_cooldown_seconds` present. The repository code tolerates this (it branches on
   `id` vs `guildId`). NOTE: a *fresh* `npm run migrate` builds the **guild-scoped** (`guildId`)
   shape instead — so production XP settings are effectively one global row for all guilds, while
   fresh installs are per-guild. Functional, but a behavioral difference to be aware of.
3. **`caged_users` / `bans` — production matches the code** (`caged_users` has `expires`,
   `role_id`, `reason`; `bans` has `method`, `banned_by_user`). The reconcile migration
   `20260811130000_reconcile_caged_users_bans_to_code.js` is therefore a **confirmed no-op on
   production** (it only fixes the divergent FRESH-migrate shape). Kept for fresh installs.
4. **`Guilds` — FIXED.** Production `Guilds` has `guildId`, `guildOwnerId`; the migration and
   snapshot agree. `createGuild()` previously inserted `owner_id` (nonexistent column) and would
   error on guild join. Fixed to insert `guildOwnerId` (the param stays `ownerId` internally). No
   migration needed — fresh/prod/snapshot all already use `guildOwnerId`.
5. **Discord/guild ID column types** are cosmetically mixed (e.g. `users.discord_id` is `bigint`,
   `user_xp.user_id` is `varchar`). No runtime impact. `users.discord_id` now has the
   `users_discord_id_unique` index (see "users.discord_id uniqueness — RESOLVED" below).

## TCG removal (migrations)

The TCG/card feature was removed from the bot. Its runtime code is gone, but **31 TCG-related
migrations were already applied in production** (`tcg_*`, `card_*`, `rarity`, `user_wallets`/
`card_data` FK repairs). Deleting those migration files would make knex report a corrupt history,
and one of them (`20260424120000_tcg_stage1_elements_abilities.js`) imported the now-deleted
`src/bot/tcg/tcgAbilitySeeds.js`, which crashed `npm run migrate` at **file-load time on every
environment, production included** (knex `require()`s every migration file to build the list).

Fix: each of the 31 TCG migrations was replaced with a **no-op historical stub** (`up`/`down` do
nothing) while keeping the original filename. This keeps knex history valid (the names still match
`knex_migrations`), removes all runtime imports from migrations, and means **fresh installs create
no TCG tables**. `src/bot/tcg/` was deleted (no seed/font files restored).

## Fresh-install status (verified 2026-06-25 on a throwaway DB)

A fresh `npm run migrate` now **completes** (79 migrations, exit 0), creates **zero** TCG tables,
and `npm run verify:schema` **passes** on the fresh DB. `migrate:list` on production loads cleanly
(TCG stubs are recognised as applied, never re-run); the only pending migrations are the four
additive/no-op reconcile migrations below.

Two latent fresh-install bugs were fixed with guarded additive reconcile migrations (both no-op on
production, which already has the columns):

- **`GuildConfigurable` feature toggles** (`xp_enabled`, `warning_enabled`, `image_archive_enabled`,
  `level_up_enabled`, `level_up_channel`) were never added on a fresh DB — migration
  `20241010025253_add_toggles_to_GuildConfigurable.js` queues `table.boolean(...)` inside an async
  `.then()` that resolves *after* the `alterTable` already ran. Fixed by
  `20260811150000_reconcile_guild_configurable_toggles.js`.
- **`channel_stats.channel_name`** was never created on a fresh DB (migration
  `20241010020718_channel_stats.js` omits it) though the channel-stats code uses it. Fixed by
  `20260811160000_reconcile_channel_stats_channel_name.js`.

### Reconcile migrations (validated individually on the real fresh shapes)

A fresh DB builds the code-incompatible shapes below; each reconcile migration was run standalone
against the throwaway DB and produced the code-correct shape. All are **no-ops on production**.

| Table | Fresh shape (migrations) | Reconcile migration | Result |
| --- | --- | --- | --- |
| `user_xp` | `user_id bigint unsigned` + FK→`users.id` | `20260811140000_reconcile_user_xp_identity_to_code.js` | → `user_id varchar(21)`, no FK, `user_xp_xp` index; idempotent; data preserved by mapping `users.id`→`users.discord_id` (aborts if any row unmappable) |
| `caged_users` | `expires_at`, no `expires` | `20260811130000_reconcile_caged_users_bans_to_code.js` | adds `expires`, relaxes `expires_at`/`old_roles` |
| `bans` | `banned_by_username`, no `method` | (same as above) | adds `method`, `banned_by_user`, relaxes `banned_by_username` |

### Accepted production-vs-fresh differences (not changed)

- **`xp_settings`**: production = legacy global single-row (`id` PK); fresh = guild-scoped
  (`guildId` PK). The repository code supports **both**, so this is accepted, not a failure.
  `verify_schema` treats either shape as valid.
- **ID column types** (`varchar` vs `bigint`): cosmetic; no runtime impact.

### Final intended `user_xp` shape

`user_id varchar(21)` PRIMARY KEY, **no foreign key**, columns `xp`/`message_count`/`level`, index
on `xp` (plus PK). Matches production and the code (snowflake key; leaderboard joins
`users.discord_id`). No FK is added by default.

## users.discord_id uniqueness (RESOLVED 2026-06-25)

`users.discord_id` is the external identity key (`getLeaderboard` joins
`user_xp.user_id = users.discord_id`; `checkUser` upserts by `discord_id`). It now has a UNIQUE
index and duplicate recurrence is prevented.

**What was done:**
- **Deduped** production: 5 duplicate groups / 8 excess rows removed (kept the lowest `id` per
  `discord_id`, preserving `id=31`'s `is_admin=1`). All 8 delete-candidates were confirmed
  unreferenced by every `users.id` foreign key (all 16 are orphaned-TCG-only). `users`: 5525 → 5517.
- **Backups:** full `users` dump `users_backup_20260625.sql`, plus an in-DB table
  `users_dedupe_backup_20260625` (13 rows = all rows of the affected groups).
- **Index:** `20260811170000_users_discord_id_unique.js` adds `users_discord_id_unique`
  (guarded — it throws rather than auto-clean if any duplicates remain). Confirmed present on prod
  (cardinality 5517) and on fresh installs.
- **Recurrence prevented:** `xpRepository.checkUser` and `web/auth.js` now **upsert**
  (`INSERT … ON DUPLICATE KEY UPDATE username`) instead of read-then-insert, so concurrent
  first-seen/login events can no longer create duplicates.
- **Verifier:** `verify_schema` now **fails** on duplicate `discord_id` or a missing unique index.

**Rollback:** restore deleted rows from the backup table —
`INSERT INTO users SELECT * FROM users_dedupe_backup_20260625 WHERE id IN (32,33,34,1962,1477,1964,1856,1857);`
(drop the unique index first: `ALTER TABLE users DROP INDEX users_discord_id_unique;`). Or restore
`users_backup_20260625.sql`. Drop the backup table once satisfied:
`DROP TABLE users_dedupe_backup_20260625;`

## Orphaned TCG tables removed from production (2026-06-25)

The 22 orphaned TCG/card tables (`card_data`, `card_trades`, `rarity`, `user_cards`,
`user_wallets`, and the `tcg_*` set) were **dropped** by
`20260811180000_drop_orphaned_tcg_tables.js`. They were unreferenced by any runtime code and had
no foreign keys from any non-TCG table (all their `users.id` FKs are gone with them; nearly all
were empty — `tcg_abilities` had 23 seed rows, `user_wallets` 1). The drop order is FK-safe and
every drop is `hasTable`-guarded, so the migration is a no-op on a fresh DB.

Backups taken before the drop (keep until confident):
- `f95bot_full_backup_2026-06-25.sql` — full database dump.
- `f95bot_tcg_tables_backup_2026-06-25.sql` — TCG-only dump (all 22 tables + data).

The 31 TCG no-op migration **stubs remain** — they exist only to keep knex migration history valid
(their names are recorded in production's `knex_migrations`); they create nothing.

**Rollback:** `migrate:down` does NOT recreate these tables (it throws with instructions). To
restore the data, import `f95bot_tcg_tables_backup_2026-06-25.sql` (or the full backup). Note that
restoring requires the `users` rows their FKs point to still exist.

## Backup artifacts (cleanup COMPLETED 2026-06-25)

The dedupe + TCG-drop rollback artifacts have been cleaned up after the smoke gate passed (bot
login + slash registration + live XP gain; web startup + OAuth redirect + auth-guard + static;
`npm test` 29/29; `verify:schema` PASS; 0 duplicate `discord_id`; `users_discord_id_unique`
present; 0 TCG tables):

- `users_dedupe_backup_20260625` (DB table) — **DROPPED** (`users`/`user_xp` untouched).
- The three SQL dumps were **moved off-repo** (not deleted) to:
  `C:/Users/ryanc/Documents/sites/f95bot-db-archive/2026-06-25/`
  - `f95bot_full_backup_2026-06-25.sql` (full DB — TCG-drop rollback)
  - `f95bot_tcg_tables_backup_2026-06-25.sql` (TCG-only dump)
  - `users_backup_20260625.sql` (full `users` dump, PII)

**Rollback after this cleanup:** dedupe/TCG recovery now depends on the **archived** dumps above
(and the documented dedupe SQL in the "users.discord_id uniqueness — RESOLVED" section). Keep that
archive on durable, secure storage; do not delete the TCG/full dumps while they are the only
rollback copy. `migrate:down` does **not** recreate dropped TCG data.

`*backup*.sql` remains gitignored so future dumps can't be committed.

**Rule (unchanged): always take a fresh full backup before running migrations on production.**
