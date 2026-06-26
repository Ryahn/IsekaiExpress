# F95Bot Deep Codebase Audit

Senior engineering audit of the Discord.js bot, Express web panel, Knex/MySQL data layer, scheduled jobs, caching, and production reliability paths.

This report captures the audit findings from the deep review. Some Phase 1 and Phase 2 reliability fixes have since been implemented; those are noted where relevant.

## Executive Summary

The highest-risk themes were:

- Guild ownership boundaries: several data models were effectively global while the bot used multi-guild Discord primitives.
- Web panel hardening: stale Discord role authorization, stored XSS, missing rate limits, and audit logging order.
- Unbounded bot work: OCR/download flows and image scanning needed stronger limits and cleanup.
- Database integrity: `channel_stats` and custom command records had app-level uniqueness assumptions without matching database guarantees.
- Production reliability: scheduled jobs could overlap, shutdown was incomplete, and the webhook log queue could grow without bound.

Phase 1 and Phase 2 patches have addressed the low-risk web/bot hardening, single-guild event boundary, channel stats race, XP settings query behavior, in-process job overlap, graceful shutdown, and logger webhook queue cap. Larger schema work for custom commands, moderation records, and farm profiles remains deferred.

## Architecture Map

| Area | Primary Files | Role |
| --- | --- | --- |
| Bot entrypoint | `src/bot/bot.js` | Creates `BotClient`, loads prefix commands/events, initializes caches, schedules jobs, and handles Discord login/shutdown. |
| Ready/startup | `src/bot/events/ready/ready.js` | Discovers slash commands, seeds command settings, registers guild slash commands, loads guild config and custom command cache. |
| Interactions | `src/bot/events/interaction/interactionCreate.js` | Handles autocomplete, modals, select menus, buttons, and slash commands. |
| Messages | `src/bot/events/messages/message.js` | High-frequency path for XP, AFK, invite/scam checks, image review, channel stats, farm, prefix commands, and custom commands. |
| Web entrypoint | `src/web/app.js` | Express middleware stack, Redis session store, Passport, public docs/stats, dynamic route index, dashboard, error handling. |
| Route loading | `src/web/routes/routerIndex.js` | Auto-loads route modules and applies file-level role checks. |
| Auth/session | `src/web/routes/auth.js` | Discord OAuth, guild-member role lookup, session population, CSRF token generation. |
| Database | `database/knex.js`, `database/db.js`, `database/repositories/*.js` | Shared Knex singleton and flat repository facade. |
| Jobs/caches | `src/bot/bot.js`, `src/bot/events/ready/ready.js`, `libs/*` | Scheduled cage cleanup, farm pings, stale invite cleanup, phish sync, in-memory command/config/dedupe caches. |
| Logging | `libs/logger.js`, `libs/loggerWebhook.js` | `silly-logger` wrapper and optional Discord webhook fanout. |

## Discord Bot Findings

### High: Global custom commands leak across guilds

- Files: `database/repositories/commandSettingsRepository.js`, `src/bot/events/messages/message.js`
- Status: Deferred; no custom command schema changes have been made.
- Issue: Custom prefix commands are keyed and cached by hash/name only. Any guild can execute a DB-backed custom command created for another guild.
- Scenario: Staff in one guild creates `!rules`; the same command becomes available in another guild.
- Recommended fix: Decide single-guild versus multi-guild. For multi-guild, add `guild_id` to `commands`, enforce unique `(guild_id, hash)`, and resolve by `(guildId, hash)`. For single-guild, keep the bot restricted to `DISCORD_GUILD_ID`.

### High: Moderation records are not guild-scoped

- File: `database/repositories/moderationRepository.js`
- Status: Deferred; no moderation schema changes have been made.
- Issue: Warnings, bans, and cages are keyed by user or record ID only.
- Scenario: In multi-guild use, moderators can view/delete global records for the same user from another guild.
- Recommended fix: Add `guild_id` to moderation tables and scope list/delete/remove operations by guild.

### High: OCR import downloads were unbounded

- Files: `src/bot/commands/slashCommands/moderation/handlers/modHandlersXp.js`, `src/bot/commands/slashCommands/misc/import_rank.js`, `src/bot/utils/rankCardOcr.js`
- Status: Fixed in Phase 1.
- Issue: OCR imports downloaded arbitrary URLs without timeout, size limit, content validation, unique temp paths, or awaited error handling.
- Fix applied: Shared OCR helper validates HTTP(S), blocks SSRF/private networks, disables redirects, enforces a streaming 5 MB cap, validates image bytes with Sharp, uses unique temp dirs, awaits the flow, and cleans up in `finally`.

### Medium: `/farm prefix` lacked permission checks

- File: `src/bot/commands/slashCommands/farm/farm.js`
- Status: Fixed in Phase 1.
- Issue: Any user could change the server-wide farm prefix.
- Fix applied: Prefix changes now require Administrator or configured staff role, matching server-level farm settings.

### Medium: Farm profile state is global per user

- File: `src/bot/utils/farm/farmManager.js`
- Status: Deferred; no farm schema changes have been made.
- Issue: Many farm methods accept `guildId` but operate by `discord_user_id` only.
- Scenario: A user farming in two guilds shares inventory, money, crop timers, reminders, and XP.
- Recommended fix: If multi-guild is intended, add `guild_id` to farm profiles/logs and key by `(guild_id, discord_user_id)`. If single-guild is intended, keep strict event-boundary enforcement.

### Medium: Message-time invite moderation performs repeated Discord/API and DB work

- File: `libs/invitePolicy.js`
- Status: Not fixed.
- Issue: Messages with many invite links can cause per-code Discord fetches and per-code DB checks.
- Recommended fix: Deduplicate invite codes before resolution, cap processed invites per message, add short-lived invite resolution cache, and batch DB lookups with `whereIn`.

### Medium: Manual reconnect logic may fight discord.js

- File: `src/bot/bot.js`
- Status: Not fully fixed.
- Issue: Custom reconnect calls can overlap with discord.js gateway resume/reconnect behavior.
- Recommended fix: Remove reconnect-on-disconnect or gate it strictly to initial login failure/destroyed state.

### Medium: Channel stats were not guild-scoped

- Files: `src/bot/utils/channelStats.js`, `database/repositories/attentionRepository.js`
- Status: Race fixed in Phase 2; guild scoping deferred.
- Issue: Stats were keyed by channel/date only. Discord channel IDs are globally unique, but command output was not explicitly scoped by guild.
- Recommended fix: For multi-guild support, add `guild_id` and scope reads/writes. For current single-guild posture, event-boundary enforcement mitigates cross-guild writes.

## Express Web Panel Findings

### High: Stale Discord roles authorize the panel

- Files: `src/web/routes/auth.js`, `src/web/routes/routerIndex.js`
- Status: Not fully fixed.
- Issue: Discord roles are fetched only during OAuth callback and then trusted from `req.session.roles`.
- Scenario: A removed staff/mod role remains authorized until session expiration.
- Recommended fix: Revalidate roles on privileged requests or use a short role-cache TTL and destroy sessions when membership/roles fail validation.

### High: Stored XSS in warnings table formatter

- Files: `src/web/views/warnings.njk`, `src/web/routes/warnings.js`
- Status: Fixed in Phase 1.
- Issue: Warning text was interpolated into a raw HTML attribute in a Tabulator formatter.
- Fix applied: Reason and action buttons are now DOM nodes; warning fields are not interpolated into raw HTML or attributes.

### Medium: Unauthenticated POSTs created audit rows before auth/CSRF

- File: `src/web/app.js`
- Status: Fixed in Phase 1.
- Issue: Global audit middleware inserted DB audit rows before session expiration and route CSRF checks.
- Fix applied: Successful authenticated mutations write to `audit`; authenticated denied/failed mutations are logged with `logger.warn`; unauthenticated POST spam does not pollute the audit table.

### Medium: No web rate limiting

- File: `src/web/app.js`
- Status: Fixed in Phase 1.
- Issue: Auth, list APIs, and mutating routes had no rate limiting.
- Fix applied: Added `express-rate-limit` for auth, list APIs, and mutating routes. `trust proxy` is set to one hop for the configured reverse proxy.

### Medium: Input validation is minimal on mutating APIs

- Files: `src/web/routes/commands.js`, `src/web/routes/warnings.js`
- Status: Partially unfixed.
- Issue: Body fields and params are mostly checked for presence, not length/format/enums.
- Recommended fix: Add schema validation for command names/content, warning IDs, user IDs, reason length, and allowed characters.

### Medium: Express error handling could hang or leak stacks

- File: `src/web/app.js`
- Status: Fixed in Phase 1.
- Issue: No central 404/error middleware.
- Fix applied: Added final 404/error middleware returning generic text/JSON without stack traces.

### Medium: CSP disabled

- Files: `src/web/app.js`, `src/web/views/*.njk`
- Status: Not fixed.
- Issue: Helmet is used with CSP disabled because templates rely on inline/CDN scripts.
- Recommended fix: Migrate toward nonce/hash-based CSP and self-host or add SRI for third-party scripts.

## Database And Query Findings

### High: `channel_stats` read-then-insert race

- Files: `src/bot/utils/channelStats.js`, `database/repositories/attentionRepository.js`
- Migration: `migrations/20260811190000_channel_stats_unique_daily_channel.js`
- Status: Fixed in Phase 2.
- Issue: Concurrent messages in the same channel/day could both insert rows.
- Fix applied: Migration dedupes duplicate `(channel_id, month_day)` rows, adds unique key, and write path uses MySQL upsert.
- Migration safety note: Run while old app instances are stopped. A concurrent old read-then-insert writer could create duplicates between dedupe and unique-key creation.

### High: `getXPSettings(guildId)` selected the full table per message

- File: `database/repositories/xpRepository.js`
- Status: Fixed in Phase 2.
- Issue: Message XP could load all `xp_settings` rows and search in JS.
- Fix applied: Probes schema shape with one row, fetches only requested guild row when `guildId` schema exists, and preserves legacy `id` fallback behavior.

### High: Custom command uniqueness is app-level only

- Files: `database/repositories/commandSettingsRepository.js`, `src/web/routes/commands.js`
- Status: Deferred by request.
- Issue: Duplicate custom commands can be created concurrently or through mixed web/slash paths.
- Recommended fix: Add uniqueness only after deciding single-guild vs multi-guild. For current single-guild, `UNIQUE(hash)` may be sufficient; for multi-guild, use `UNIQUE(guild_id, hash)`.

### Medium: Ban list selected `ban_id`, but schema creates `id`

- File: `src/bot/commands/slashCommands/moderation/handlers/modHandlersBans.js`
- Status: Fixed in Phase 1.
- Fix applied: Selects `id as ban_id` without schema change.

### Recommended Indexes And Constraints

Deferred until the guild model is finalized:

- `commands`: single-guild `UNIQUE(hash)` or multi-guild `UNIQUE(guild_id, hash)`.
- `warnings`: `INDEX(warn_user_id, created_at)` or multi-guild `INDEX(guild_id, warn_user_id, created_at)`.
- `bans`: `INDEX(discord_id)`, `INDEX(created_at)`, optional unique active-ban constraint.
- `caged_users`: `INDEX(expires)`, optional unique active-cage constraint.
- `farm_profiles`: if multi-guild, `UNIQUE(guild_id, discord_user_id)`.
- `farm_xp_log`: if multi-guild, `INDEX(guild_id, discord_user_id, id)`.

Implemented:

- `channel_stats`: `UNIQUE(channel_id, month_day)`.

## Background Jobs And Reliability

### Medium: Scheduled jobs could overlap

- Files: `src/bot/bot.js`, `src/bot/events/ready/ready.js`, `src/bot/utils/nonOverlappingJob.js`
- Status: Fixed in Phase 2 for in-process overlap.
- Jobs covered:
  - Caged cleanup
  - Farm maturity reminders
  - Stale invite cleanup
  - Phish sync
- Remaining risk: Multiple bot processes can still run the same job. Distributed locks were intentionally deferred.

### Medium: Web had no graceful shutdown

- File: `src/web/app.js`
- Status: Fixed in Phase 2.
- Fix applied: SIGTERM/SIGINT closes HTTP server, Redis client, Knex pool, and webhook timer. Shutdown is idempotent.

### Medium: Bot shutdown could double-close resources

- File: `src/bot/bot.js`
- Status: Fixed in Phase 2.
- Fix applied: SIGTERM/SIGINT path stops scheduled jobs/intervals, destroys Discord client, closes Knex, stops webhook timer, and avoids double shutdown.

### Medium: Logger webhook queue was unbounded

- Files: `libs/loggerWebhook.js`, `libs/logger.js`
- Status: Fixed in Phase 2.
- Fix applied: Queue capped at 100 pending items. Overflow is aggregated into one warning. Timer can be stopped on shutdown.

## Security Findings

### Secrets and environment

- `.env` exists locally and should not be committed.
- `.env.example` should avoid real secrets and should document production-safe `SESSION_COOKIE_SECURE=true`.
- `SESSION_SECRET` is required at web startup.

### Sessions

- Redis session store is production-appropriate.
- Cookies use `httpOnly` and `sameSite: lax`.
- `secure` depends on config and should be enforced in production.
- Cookie `maxAge` is not aligned with `req.session.expires`.

### CSRF

- Current mutating routes use ad hoc `_csrf` checks.
- Recommended fix: centralize CSRF middleware so future routes do not forget it.

### SSRF and unsafe downloads

- OCR import SSRF fixed in Phase 1.
- Other network-fetching commands should be reviewed before accepting user-controlled URLs.

## Single-Guild Design Note

The codebase currently looks operationally single-guild:

- Web OAuth checks membership/roles against configured `DISCORD_GUILD_ID`.
- Slash command registration targets `Routes.applicationGuildCommands(applicationId, guildId)`.
- Scheduled moderation/farm jobs use `config.discord.guildId`.

Phase 1 added single-guild enforcement at the bot event boundary:

- Messages outside `config.discord.guildId` are ignored before XP/moderation/stats/farm/commands.
- Interactions outside the configured guild are rejected or ignored safely.
- Unexpected guild joins are logged and left.
- Unexpected guild deletes and audit-log events are ignored.

If the bot should become truly multi-guild later, the schema work should be planned explicitly:

- Add `guild_id` to custom commands, moderation records, channel stats, and farm profiles/logs.
- Backfill existing rows from configured `DISCORD_GUILD_ID`.
- Add composite indexes and uniqueness constraints.
- Update all repository APIs to require `guildId`.
- Only then remove single-guild event rejection.

## Verification Performed

After Phase 1 and Phase 2 patches:

- `node --check` passed for edited JavaScript files.
- `ReadLints` reported no linter errors on edited files.
- `npm test` passed.

Latest test run after Phase 2:

- 47 tests passed.
- 0 failed.

The test suite logs expected DB DNS errors when `f95bot-mysql` is not available, but tests still pass.
