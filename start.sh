#!/usr/bin/env bash
# Build, migrate, and start the f95bot stack. Use from Git Bash, MSYS, or WSL (LF line endings).
# Usage: ./start.sh --profile=bot|web|both

set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  set +u
  # shellcheck source=/dev/null
  . ./.env
  set -u
  set +a
fi

ROOT="${MYSQL_ROOT_PASSWORD:-root}"
MYSQL_CONTAINER="f95bot-mysql"
WAIT_SECS="${START_MYSQL_WAIT_SECS:-60}"

usage() {
  echo "Usage: $0 --profile=bot|web|both" >&2
  echo "  bot   - mysql, redis, Discord bot" >&2
  echo "  web   - mysql, redis, web app" >&2
  echo "  both  - mysql, redis, bot, and web" >&2
}

PROFILE=""
while [ $# -gt 0 ]; do
  case $1 in
    --profile=*)
      PROFILE="${1#--profile=}"
      shift
      ;;
    --profile)
      shift
      if [ $# -eq 0 ]; then
        echo "Error: --profile requires a value (bot, web, or both)." >&2
        exit 1
      fi
      PROFILE="$1"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ -z "$PROFILE" ]; then
  echo "Error: --profile=bot, --profile=web, or --profile=both is required." >&2
  usage
  exit 1
fi

case "$PROFILE" in
  bot | web | both) ;;
  *)
    echo "Error: invalid --profile: $PROFILE (use bot, web, or both)" >&2
    exit 1
    ;;
esac

wait_for_mysql() {
  local i=0
  echo "Waiting for MySQL in $MYSQL_CONTAINER (up to ${WAIT_SECS}s)..."
  while [ "$i" -lt "$WAIT_SECS" ]; do
    if docker exec "$MYSQL_CONTAINER" mysqladmin ping -h 127.0.0.1 -uroot -p"$ROOT" --silent 2>/dev/null; then
      echo "MySQL is ready."
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "Error: MySQL did not become ready in ${WAIT_SECS}s." >&2
  return 1
}

docker-compose up -d mysql redis
wait_for_mysql

echo "Running database migrations (knex migrate:latest)..."
sh scripts/docker-migrate.sh

if [ "$PROFILE" = "web" ] || [ "$PROFILE" = "both" ]; then
  if ! docker network inspect traefik-network >/dev/null 2>&1; then
    echo "Creating external network traefik-network (required for web)..."
    docker network create traefik-network
  fi
fi

case "$PROFILE" in
  bot)
    echo "Starting bot (build + up)..."
    docker-compose up -d --build mysql redis bot
    ;;
  web)
    echo "Starting web (build + up)..."
    docker-compose --profile web up -d --build mysql redis web
    ;;
  both)
    echo "Starting bot and web (build + up)..."
    docker-compose --profile web up -d --build mysql redis bot web
    ;;
esac

echo "Done. Profile: $PROFILE"
