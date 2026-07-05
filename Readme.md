# IsekaiExpress (f95bot)

Discord bot and web control panel for the F95Zone community server. Configuration is driven by [`.env.example`](.env.example) and loaded through [`config/index.js`](config/index.js).

## Prerequisites

- **Node.js 20+** (recommended via [nvm](https://github.com/nvm-sh/nvm))
- **Docker Compose** (recommended for MySQL + Redis + bot)
- Or local **MySQL 8** and **Redis 7** if running without Docker

## Quick start (Docker Compose)

1. Clone the repository and install dependencies (for local tooling/scripts):

```bash
git clone https://github.com/f95bot/f95bot.git
cd f95bot
npm install
```

2. Create environment file from the template and fill in secrets (Discord tokens, guild/role IDs, MySQL passwords):

```bash
cp .env.example .env
```

See [`.env.example`](.env.example) for every variable. At minimum set:

- `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `APPLICATION_ID`
- `MYSQL_PASS`, `MYSQL_ROOT_PASSWORD`, `SESSION_SECRET`
- Role IDs (`ROLE_STAFF`, `ROLE_MOD`, etc.)

3. Start the stack:

```bash
docker compose up -d --build
```

Compose overrides `MYSQL_HOST=f95bot-mysql` and `REDIS_URL=redis://f95bot-redis:6379` for the bot container. Use the **container name** `f95bot-mysql`, not the service name `mysql`, if your host shares Docker networks with other stacks.

4. First-time database setup:

```bash
npm run setup
```

Or, with Compose already running:

```bash
sh scripts/docker-migrate.sh
```

For a **brand-new empty database** (seeds only, no existing dump):

```bash
sh scripts/docker-seed-first-init.sh
```

If the bot errors on custom commands after importing an old SQL dump:

```bash
docker compose run --build --rm --no-deps bot sh -c "npx knex migrate:latest"
```

5. Optional: start the web panel (Traefik profile in `docker-compose.yml`):

```bash
docker compose --profile web up -d --build
```

The panel listens on `PORT` from `.env` (default `3000`).

## Running locally (without Docker)

1. Copy and configure `.env`. For a DB on the host, set `MYSQL_HOST=127.0.0.1` and `REDIS_URL=redis://127.0.0.1:6379`.
2. Apply migrations: `npm run migrate`
3. Start processes:

```bash
npm run start:bot   # Discord bot
npm run start:web   # Web control panel
```

## Optional integrations

Leave API keys blank to disable the dependent feature. Full list and comments are in [`.env.example`](.env.example).

| Variable | Feature |
|----------|---------|
| `IMG_API_KEY` | Image API reactions (`/furry`, NSFW fun commands) |
| `THE_CAT_API_KEY` | `!cat` command |
| `FEMBOY_API_KEY` | `/femboy` (Gelbooru) |
| `YOUTUBE_API_KEY` | YouTube lookup commands |
| `ZONIE_API_KEY` | URL shortening in `/attention` |
| `STARBOARD_ARCHIVE_*` | Local starboard disaster-recovery archive |
| `PHISH_GG_DAILY_SYNC` | Daily phish.gg blacklist sync |
| `IMAGE_REHOST_*` | Custom command image rehost in web panel |

## Development utilities

```bash
npm test                          # Node test runner
npm run verify:schema             # Check DB schema matches code expectations
node scripts/test-furry-license.js <discord_user_id> [--template furry|loli] [--grid]
```

## Database notes

- Migrations: `npm run migrate` or `npx knex migrate:latest`
- Schema drift and recovery: see [`database/README.md`](database/README.md)
- Full volume reset + `f95bot.sql` import: `CONFIRM_RESET=yes sh scripts/reset-mysql-volume-and-restore.sh` (back up first)

## Legacy reverse proxy (optional)

If you are not using Traefik/Docker labels, an example nginx config lives at [`database/nginx.conf`](database/nginx.conf). Point it at the web panel port from `.env` and terminate TLS upstream of the app.

## Project layout

- `src/bot/` — Discord bot (commands, events, utils)
- `src/web/` — Express control panel
- `libs/` — Shared server-side helpers
- `database/` — Knex config, repositories, seed schemas
- `migrations/` — Database migrations

Made for F95Zone by Ryahn.
