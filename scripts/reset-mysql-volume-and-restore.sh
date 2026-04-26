#!/usr/bin/env sh
# Wipe the MySQL Docker volume, recreate a fresh MySQL, import f95bot.sql.
# Set MYSQL_ROOT_PASSWORD, MYSQL_USER, MYSQL_PASS, MYSQL_DB in .env *before* running; the
# official image only applies those on the first start (empty data dir). The .sql file does
# not need password edits — it is app data only, not MySQL user definitions.
#
#   sh scripts/reset-mysql-volume-and-restore.sh [path/to/dump.sql]
#
# Stops the compose stack, removes the mysql_data volume, starts mysql, waits, imports, runs
# pending knex migrations (so app_state and newer schema exist), then starts the full stack.
# Redis volume is not removed. Seeds are not run (avoids duplicating seed data on top of the dump).
# For an empty DB without a dump, use sh scripts/docker-migrate.sh then sh scripts/docker-seed-first-init.sh once.
set -e
cd "$(dirname "$0")/.."
DUMP="${1:-./f95bot.sql}"
if [ ! -f "$DUMP" ]; then
  echo "Missing dump file: $DUMP"
  exit 1
fi
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
ROOT="${MYSQL_ROOT_PASSWORD:-root}"
DB="${MYSQL_DB:-f95bot}"
CONTAINER="${MYSQL_DOCKER_NAME:-f95bot-mysql}"

# Compose v2: volume name is ${project}_mysql_data (project = directory name or COMPOSE_PROJECT_NAME)
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$(pwd)")}"
VOL="${PROJECT}_mysql_data"

echo "This will remove Docker volume: $VOL (MySQL data only) and re-import: $DUMP"
if [ "${CONFIRM_RESET:-}" != "yes" ]; then
  echo "Set CONFIRM_RESET=yes to proceed."
  exit 1
fi

docker compose down
if docker volume inspect "$VOL" >/dev/null 2>&1; then
  docker volume rm "$VOL"
else
  echo "Volume $VOL not found (will be created on up)."
fi

docker compose up -d mysql
echo "Waiting for MySQL to accept connections..."
# Prefer the password from the running container (Compose injects .env). Sourcing .env in sh
# often disagrees with Compose (unquoted $ # ! newlines, etc.).
i=0
ROOT_RESOLVED=""
while [ "$i" -lt 30 ]; do
  if ROOT_TRY=$(docker exec "$CONTAINER" sh -c 'printf %s "$MYSQL_ROOT_PASSWORD"' 2>/dev/null) && [ -n "$ROOT_TRY" ]; then
    ROOT_RESOLVED="$ROOT_TRY"
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ -z "$ROOT_RESOLVED" ]; then
  echo "Container did not expose MYSQL_ROOT_PASSWORD; using value from .env / default."
  ROOT_RESOLVED="$ROOT"
fi
ROOT="$ROOT_RESOLVED"
export MYSQL_PWD="$ROOT"
i=0
while [ "$i" -lt 60 ]; do
  if docker exec -e MYSQL_PWD "$CONTAINER" mysqladmin ping -h 127.0.0.1 -uroot --silent 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 2
done
if [ "$i" -eq 60 ]; then
  echo "MySQL did not become ready in time."
  exit 1
fi

echo "Importing $DUMP into database $DB ..."
# MYSQL_PWD: same as -p but no stdin clash with the dump; -e MYSQL_PWD forwards host env (safe for $ " in password).
docker exec -e MYSQL_PWD -i "$CONTAINER" mysql -uroot -h 127.0.0.1 "$DB" < "$DUMP"

echo "Applying pending database migrations (e.g. app_state for custom commands cache)..."
sh scripts/docker-migrate.sh

echo "Done. Starting remaining services..."
docker compose up -d
unset MYSQL_PWD
echo "Restore complete. Verify: export MYSQL_PWD=...; docker exec -e MYSQL_PWD $CONTAINER mysql -uroot -h 127.0.0.1 -e \"USE $DB; SHOW TABLES;\""
