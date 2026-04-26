#!/usr/bin/env sh
# Run knex migrate:latest inside a one-off bot container (same image as bot/web).
# Requires MySQL up; waits for mysqladmin ping like start.sh. From repo root:
#   sh scripts/docker-migrate.sh
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  set +u
  # shellcheck source=/dev/null
  . ./.env
  set -u
  set +a
fi

ROOT="${MYSQL_ROOT_PASSWORD:-root}"
MYSQL_CONTAINER="${MYSQL_DOCKER_NAME:-f95bot-mysql}"
WAIT_SECS="${START_MYSQL_WAIT_SECS:-60}"

wait_for_mysql() {
  _i=0
  echo "Waiting for MySQL in $MYSQL_CONTAINER (up to ${WAIT_SECS}s)..."
  while [ "$_i" -lt "$WAIT_SECS" ]; do
    if docker exec "$MYSQL_CONTAINER" mysqladmin ping -h 127.0.0.1 -uroot -p"$ROOT" --silent 2>/dev/null; then
      echo "MySQL is ready."
      return 0
    fi
    _i=$((_i + 1))
    sleep 1
  done
  echo "Error: MySQL did not become ready in ${WAIT_SECS}s." >&2
  return 1
}

wait_for_mysql
echo "Running database migrations (knex migrate:latest via bot)..."
docker compose run --rm --no-deps bot sh -c "npx knex migrate:latest"
