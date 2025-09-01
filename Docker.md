# Docker & Deployment Guide

This guide explains how to run the **IsekaiExpress** stack locally for development and how to deploy to production using Docker Compose. It also documents the helper scripts and how migrations are orchestrated so the bot and web services don’t start before the database schema is ready.

---

## TL;DR

* **Dev (hot‑reload):**

  ```bash
  ./docker-dev.sh up
  ./docker-dev.sh logs
  ./docker-dev.sh restart
  ```
* **Prod deploy (from server):**

  ```bash
  ./deploy.sh            # auto-detects if rebuild is needed, then up -d
  ./deploy.sh --build    # force rebuild
  ./deploy.sh --migrate  # additionally run migrations (optional belt & suspenders)
  ```
* **Migrations are guaranteed:** a one‑shot `migrate` service runs `knex migrate:latest` and both `bot` & `web` wait for it to complete successfully before starting.

---

## Repository Layout (relevant to Docker)

```
/              # repo root (bind-mounted to /app in dev)
├─ src/
│  ├─ bot/     # discord bot code
│  └─ web/     # web panel code
├─ docker/     # Dockerfiles and configs
│  ├─ Dockerfile.bot
│  └─ Dockerfile.web
├─ docker-compose.yml          # base compose (dev defaults)
├─ docker-compose.prod.yml     # prod overrides for bot/web
├─ docker-dev.sh               # helper for dev profile
├─ deploy.sh                   # helper for prod deploys on server
├─ knexfile.js                 # knex config at repo root
├─ nodemon.json                # nodemon config at repo root
├─ package.json                # single root node_modules
└─ config/ (optional)          # if you moved .config.js here
```

> **Single `node_modules` at root**: Images install dependencies at `/app/node_modules`. In dev we bind‑mount the whole repo to `/app` and create an anonymous volume at `/app/node_modules` so the mounted tree does not mask image deps.

---

## Services in the Stack

* **mysql** – MySQL 8 with a persistent named volume `mysql_data`. Exposes **host** port `${MYSQL_HOST_PORT:-3307}` mapped to **container** `3306`. Healthcheck gates dependents.
* **redis** – Redis 7 used as cache/queue. Ephemeral by default (no volume). Optional persistence can be enabled.
* **migrate** – One‑shot runner that executes `npx knex --knexfile /app/knexfile.js migrate:latest` and exits `0` when up‑to‑date. `bot` and `web` wait for it.
* **bot** – Discord bot service. In dev, runs through **nodemon** with hot reload. In prod, runs `npm run start:bot`.
* **web** – Web panel. In dev, nodemon + hot reload. In prod, `npm run start:web`, published on `${WEB_PORT:-3000}`.
* **knex** – (Optional) ad‑hoc CLI utility for manual migrations/seeds within the stack.

---

## Compose Files Explained

### `docker-compose.yml` (base)

* Defines **all** services and sensible defaults for development:

  * **Volumes**: `mysql_data` (persistent for MySQL). Redis persistence commented out.
  * **Networks**: `appnet` private network.
  * **Healthchecks**: MySQL and Redis expose healthy states; `bot`/`web` are gated.
  * **Dev bind mounts**: `.:/app` and anonymous `/app/node_modules` for both `bot` and `web`.
  * **migrate** service is included and both `bot` and `web` use:

    ```yaml
    depends_on:
      migrate: { condition: service_completed_successfully }
    ```
  * **nodemon** runs for `bot` and `web` in dev; nodemon restarts do **not** re‑run migrations (migrations run once per container start via the `migrate` service).

### `docker-compose.prod.yml` (prod override)

* **Overrides only `bot` and `web`**:

  * Sets build `target: prod`.
  * Removes bind mounts (`volumes: []`).
  * Runs plain `npm run start:bot` / `start:web` (no nodemon).
  * Keeps the dependency on `migrate` so migrations run before apps start.
* You can keep MySQL/Redis definitions solely in the base file to avoid drift.

---

## Dev Workflow (`docker-dev.sh`)

The script is a thin wrapper around Compose with the **dev profile** defaults. It passes through useful environment variables and provides friendly subcommands.

### Common commands

```bash
./docker-dev.sh up        # build + start in background (dev)
./docker-dev.sh logs      # tail bot, web, mysql, redis logs
./docker-dev.sh restart   # restart bot & web (fast)
./docker-dev.sh status    # show stack status
./docker-dev.sh migrate   # run knex migrate:latest (ad‑hoc)
./docker-dev.sh seed      # run knex seed:run (ad‑hoc)
./docker-dev.sh down      # stop and remove containers
```

### Env knobs

* `PROFILE` (default: `dev`)
* `BUILD_TARGET` (default: `dev`)
* `WEB_PORT` (default: `3000`)
* `MYSQL_HOST_PORT` (default: `3307`)

Examples:

```bash
WEB_PORT=8080 ./docker-dev.sh up
MYSQL_HOST_PORT=4407 ./docker-dev.sh up
```

---

## Production Deployment (`deploy.sh`)

`deploy.sh` is intended to run **on the server**. It:

1. `git fetch && git pull` to get the latest code.
2. Detects whether a **rebuild** is needed (changed `package.json`, compose files, `docker/`, etc.).
3. Builds images (with `--pull`/`--no-cache` if requested) and runs `up -d` using base + prod override.
4. Optionally runs `knex migrate:latest` (you can add `--migrate`, though the `migrate` service already ensures this).

### Common usage

```bash
./deploy.sh                 # auto-detect rebuild, then up -d
./deploy.sh --build         # force rebuild
./deploy.sh --pull          # pull newer base images during build
./deploy.sh --no-cache      # rebuild without cache (good for native deps)
./deploy.sh --migrate       # also run migrations explicitly
./deploy.sh --status        # show compose ps
```

### Updating on server with git

* **Code-only change:**

  ```bash
  git pull
  ./deploy.sh              # or ./deploy.sh --no-build
  ```
* **Dependency change (`package.json` / lockfile):**

  ```bash
  git pull
  ./deploy.sh --build
  ```
* **Native module weirdness (e.g., sharp, @napi-rs/canvas):**

  ```bash
  git pull
  ./deploy.sh --no-cache
  ```

> Because prod has no bind mounts, **images must be rebuilt** to pick up code/dependency changes.

---

## Migrations Strategy

* The `migrate` service runs `knex migrate:latest` once on every `up` or stack restart.
* `bot` and `web` declare:

  ```yaml
  depends_on:
    migrate: { condition: service_completed_successfully }
  ```

  so they only start after migrations complete.
* Knex uses a lock table internally—safe if multiple things try to migrate, but we centralize it to a single one-shot service for clarity and speed.

### Manual migrations / seeds

* Ad‑hoc from dev:

  ```bash
  ./docker-dev.sh migrate
  ./docker-dev.sh seed
  ```
* Raw compose form:

  ```bash
  docker compose run --rm knex migrate:latest
  docker compose run --rm knex seed:run
  ```

---

## Redis Persistence (optional)

By default Redis is ephemeral (no volume). If you need durable queues/sessions, enable AOF persistence:

1. Create a config at `docker/configs/redis.conf`:

   ```
   appendonly yes
   appendfsync everysec
   ```
2. Uncomment in `docker-compose.yml` under `redis`:

   ```yaml
   command: ["redis-server", "/usr/local/etc/redis/redis.conf"]
   volumes:
     - ./docker/configs/redis.conf:/usr/local/etc/redis/redis.conf:ro
     - redis_data:/data
   ```

> Keep Redis unexposed (no `ports:`). It’s consumed only on the internal `appnet` network.

---

## MySQL Access (TablePlus / SSH)

* The container listens on `3306` internally; the host publishes `${MYSQL_HOST_PORT:-3307}`. Connect to the **host** on that port (or via SSH tunnel) with the credentials in compose env.
* Data is persisted in the named volume `mysql_data`. Back it up with `docker run --rm -v isekaiexpress_mysql_data:/var/lib/mysql ...` tooling or use dumps from inside the `mysql` container.

---

## Environment & Security Notes

* `TZ=America/Chicago` is set across services for consistent logs.
* MySQL port is published—**restrict it** via firewall or use SSH tunneling from your workstation.
* Containers run as the `node` user (non‑root) and use `tini`/`init: true` for PID 1 signal handling on `bot`/`web`.
* Avoid committing secrets to the repo. If you centralize configs under `/config/.config.js`, mount/copy as read‑only where possible.

---

## Common Troubleshooting

* **`ECONNREFUSED` to MySQL**: Ensure `bot`/`web` are gated on `mysql` **and** `migrate` (they are, via `depends_on`). Check `docker compose logs mysql` and that `${MYSQL_HOST_PORT}` isn’t conflicting.
* **Module not found in dev**: Confirm the anonymous `/app/node_modules` volume exists and you didn’t accidentally remove it. Rebuild images if `package.json` changed.
* **Migrations not applying**: Check `docker compose logs migrate` and verify `knexfile.js` points to the same DB credentials the services use.
* **Native dependency errors**: Rebuild with `--no-cache` (`./deploy.sh --no-cache`) so native binaries are rebuilt for the image.

---

## Handy Commands Reference

```bash
# Start dev stack with hot reload
./docker-dev.sh up

# Tail logs (bot, web, mysql, redis)
./docker-dev.sh logs

# Restart only bot & web
./docker-dev.sh restart

# Run latest migrations / seeds on demand (dev)
./docker-dev.sh migrate
./docker-dev.sh seed

# Stop and remove containers
./docker-dev.sh down

# Production deploy
./deploy.sh            # smart default
./deploy.sh --build    # force rebuild
./deploy.sh --pull     # pull latest base images during build
./deploy.sh --no-cache # rebuild all layers fresh
./deploy.sh --migrate  # extra migration run (optional)
```

---

## FAQ

**Q: Can I still run only the bot or only the web panel in dev?**
A: Yes. Comment one of them out temporarily or run `docker compose up bot` (it will still ensure MySQL/Redis/migrate are ready).

**Q: I update code directly on the server with `git pull`. Is that okay?**
A: Yes—then run `./deploy.sh`. If `package.json` changed, it will rebuild; otherwise it will reuse images and just restart containers.

**Q: Where do logs go?**
A: By default to Docker stdout/stderr. Use `docker compose logs -f` or your host’s logging driver. If you want file logs, mount a `./logs:/app/logs` volume and have the app write there.

**Q: How do I enable Redis persistence later?**
A: Add `docker/configs/redis.conf` with `appendonly yes` and uncomment the `redis` `command:` and `volumes:` lines plus the `redis_data` named volume.

---

If anything in this doc drifts from the code, treat the compose files as the source of truth and open a PR to update **Docker.md** accordingly.
