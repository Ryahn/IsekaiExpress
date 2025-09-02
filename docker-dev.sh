#!/usr/bin/env bash
set -euo pipefail

PROFILE="${PROFILE:-dev}"       # dev | prod
BUILD_TARGET="${BUILD_TARGET:-dev}"
WEB_PORT="${WEB_PORT:-3000}"
MYSQL_HOST_PORT="${MYSQL_HOST_PORT:-3307}"

export PROFILE BUILD_TARGET WEB_PORT MYSQL_HOST_PORT

dc() {
  PROFILE="$PROFILE" BUILD_TARGET="$BUILD_TARGET" WEB_PORT="$WEB_PORT" MYSQL_HOST_PORT="$MYSQL_HOST_PORT" \
  docker compose --profile "$PROFILE" "$@"
}

usage() {
  cat <<EOF
Usage: PROFILE=dev|prod BUILD_TARGET=dev|prod $0 [cmd]

Commands:
  up         Build and start the stack
  down       Stop and remove containers
  restart    Restart bot & web (independently restartable)
  logs       Tail logs for bot, web, mysql, redis
  migrate    Run knex migrate:latest
  rollback   Run knex migrate:rollback
  seed       Run knex seed:run
  status     Show container status
EOF
}

case "${1:-}" in
  up)       dc up --build -d ;;
  down)     dc down ;;
  restart)  dc restart bot web ;;
  logs)     dc logs -f bot web mysql redis ;;
  migrate)  dc run --rm knex migrate:latest ;;
  rollback) dc run --rm knex migrate:rollback ;;
  seed)     dc run --rm knex seed:run ;;
  status)   dc ps ;;
  ""|help|-h|--help) usage ;;
  *) echo "Unknown cmd: $1"; usage; exit 1 ;;
esac
