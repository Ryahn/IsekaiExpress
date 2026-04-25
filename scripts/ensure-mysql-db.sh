#!/usr/bin/env sh
# Create MYSQL_DB if missing (fixes ER_BAD_DB_ERROR / Unknown database after reusing an old volume
# or when the first init did not run MYSQL_DATABASE). Run from repo root with the stack up:
#   sh scripts/ensure-mysql-db.sh
set -e
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi
ROOT="${MYSQL_ROOT_PASSWORD:-root}"
DB="${MYSQL_DB:-f95bot}"
USER="${MYSQL_USER:-f95bot}"
CONTAINER="${MYSQL_DOCKER_NAME:-f95bot-mysql}"
docker exec "$CONTAINER" mysql -uroot -p"$ROOT" -e \
  "CREATE DATABASE IF NOT EXISTS \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`$DB\`.* TO '$USER'@'%'; FLUSH PRIVILEGES;"
echo "Database '$DB' is ready. Run migrations if needed: docker compose --profile migrate run --rm migrate"
