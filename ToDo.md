# Refactor & tooling (order)

1. **Keep flat fixes in place first** — do correctness and small targeted fixes before large restructuring.

2. **Optional later:** split [`database/db.js`](database/db.js) into modules like `repositories/xp.js` and `repositories/moderation.js`, keeping `db.js` as the Knex instance plus re-exports.

# Code layout (post flat-fixes)

Do **not** do this before correctness fixes; order below is **suggested effort / payoff**.

1. **[DB]** Split [`database/db.js`](database/db.js) into repositories (`xp`, `moderation`, etc.); keep one Knex instance plus re-exports.

2. **[Bot — message event]** Decompose [`src/bot/events/messages/message.js`](src/bot/events/messages/message.js): separate modules for XP, AFK, channel stats, custom commands, prefix — thin `message.js` that calls them in order (easier to test and to reason about under load).

3. **[Bot — ready]** Split [`src/bot/events/ready/ready.js`](src/bot/events/ready/ready.js): e.g. slash registration vs guild DB sync vs warming `client.guild*prefix` / config caches (smaller functions or files).

4. **[Bot — lifecycle]** Extract scheduled cage job (and similar) from [`src/bot/bot.js`](src/bot/bot.js) into e.g. `src/bot/jobs/cageExpiry.js` so `bot.js` stays wire-up + login + shutdown.

5. **`libs/` vs bot** — Either move [`libs/`](libs/) under `src/shared/` (or `src/lib/`) with domain folders, or keep `libs/` but group by domain so it does not become a junk drawer. Rule of thumb: bot = Discord shell; lib = business rules + DB use.

6. **[Web, optional]** If route files grow fat with Knex, add a thin `src/web/services/` layer per domain.

7. **[Slash commands, optional later]** Many near-identical “fun” commands — consider a data-driven or generator approach when editing 40+ files gets painful; not a runtime priority.

8. **Avoid for now** — deep DDD / many micro-packages for a single-guild bot; big renames of `src/bot` unless you are already changing those areas (e.g. d.js 14, env).

# Blacklist Invites & Links System
1. Need a command to pull server data by using server ID. Something like /mod blacklist server_whois serverID: ID
-- This would return an embed about the server. 