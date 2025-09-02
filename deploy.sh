#!/usr/bin/env bash
# deploy.sh — simple, safe prod deploy for IsekaiExpress
# Usage:
#   ./deploy.sh                # normal deploy (auto detect if rebuild is needed)
#   ./deploy.sh --build        # force rebuild
#   ./deploy.sh --no-build     # skip build, just up -d
#   ./deploy.sh --pull         # add --pull to build step (get latest base images)
#   ./deploy.sh --no-cache     # build with --no-cache
#   ./deploy.sh --migrate      # run knex migrate:latest after up
#   ./deploy.sh --status       # just show docker compose ps
#   ./deploy.sh --help

set -euo pipefail

# ---- Config (edit if you like) ----
BASE_COMPOSE="docker-compose.yml"
PROD_COMPOSE="docker-compose.prod.yml"
BUILD_TARGET="${BUILD_TARGET:-prod}"
NODE_ENV="${NODE_ENV:-production}"

# Ports: you can export these before calling, or let your compose defaults apply
WEB_PORT="${WEB_PORT:-3000}"
MYSQL_HOST_PORT="${MYSQL_HOST_PORT:-3307}"

# Heuristic: files that should trigger a rebuild when changed
REBUILD_PATHS_REGEX='^(package(-lock)?\.json|docker-compose\.yml|docker-compose\.prod\.yml|docker/|Dockerfile|Dockerfile\..*)'

# Extra heuristic: if these native deps appear in diff, prefer --no-cache
NATIVE_DEPS_REGEX='(@napi-rs/canvas|sharp|canvas|node-canvas|better-sqlite3|bcrypt|argon|argon2)'

# ---- Flags ----
FORCE_BUILD=false
SKIP_BUILD=false
DO_PULL=false
NO_CACHE=false
DO_MIGRATE=false
JUST_STATUS=false

for arg in "$@"; do
  case "$arg" in
    --build) FORCE_BUILD=true ;;
    --no-build) SKIP_BUILD=true ;;
    --pull) DO_PULL=true ;;
    --no-cache) NO_CACHE=true ;;
    --migrate) DO_MIGRATE=true ;;
    --status) JUST_STATUS=true ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"; exit 1 ;;
  esac
done

dc() {
  BUILD_TARGET="$BUILD_TARGET" NODE_ENV="$NODE_ENV" WEB_PORT="$WEB_PORT" MYSQL_HOST_PORT="$MYSQL_HOST_PORT" \
  docker compose -f "$BASE_COMPOSE" -f "$PROD_COMPOSE" "$@"
}

log() { printf "\033[1;34m[deploy]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[err]\033[0m %s\n" "$*" >&2; }

if $JUST_STATUS; then
  dc ps
  exit 0
fi

# Ensure we're in repo root (where compose files live)
if [ ! -f "$BASE_COMPOSE" ] || [ ! -f "$PROD_COMPOSE" ]; then
  err "Run this from the repo root (where $BASE_COMPOSE and $PROD_COMPOSE are)."
  exit 1
fi

# Capture current commit before pull
BEFORE_SHA="$(git rev-parse --verify HEAD 2>/dev/null || echo "unknown")"

log "Pulling latest changes…"
git fetch --all --prune
# If you always deploy from a specific branch, uncomment and set it:
# git checkout main
git pull --ff-only

AFTER_SHA="$(git rev-parse --verify HEAD)"
if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
  log "No new commits. (HEAD unchanged: $AFTER_SHA)"
else
  log "Updated: $BEFORE_SHA → $AFTER_SHA"
fi

# Decide whether to rebuild
NEED_REBUILD=false
NATIVE_TOUCHED=false
if [ "$BEFORE_SHA" != "unknown" ] && [ "$BEFORE_SHA" != "$AFTER_SHA" ]; then
  CHANGED=$(git diff --name-only "$BEFORE_SHA" "$AFTER_SHA" || true)
  if echo "$CHANGED" | grep -Eq "$REBUILD_PATHS_REGEX"; then
    NEED_REBUILD=true
  fi
  # If package.json changed, check for native deps and favor --no-cache for safety
  if echo "$CHANGED" | grep -Eq '^package\.json$'; then
    DIFF_PKG=$(git diff "$BEFORE_SHA" "$AFTER_SHA" -- package.json || true)
    if echo "$DIFF_PKG" | grep -Eqi "$NATIVE_DEPS_REGEX"; then
      NATIVE_TOUCHED=true
    fi
  fi
fi

# Flag overrides
$FORCE_BUILD && NEED_REBUILD=true
$SKIP_BUILD && NEED_REBUILD=false
$NO_CACHE && NATIVE_TOUCHED=true   # honor user choice

# Build args
BUILD_ARGS=(build)
$DO_PULL && BUILD_ARGS+=("--pull")
$NATIVE_TOUCHED && warn "Native deps changed or --no-cache specified; forcing no-cache" && BUILD_ARGS+=("--no-cache")
BUILD_ARGS+=("--build-arg" "BUILD_TARGET=$BUILD_TARGET")  # Optional, if used in Dockerfiles

# Deploy
if $NEED_REBUILD; then
  log "Rebuilding images (BUILD_TARGET=$BUILD_TARGET, NODE_ENV=$NODE_ENV)…"
  dc "${BUILD_ARGS[@]}"
else
  log "Rebuild not required."
fi

log "Starting/Updating containers…"
dc up -d

# Optional migrations
if $DO_MIGRATE; then
  log "Running migrations…"
  # Ensure DB is healthy before running (simple wait loop)
  ATTEMPTS=40
  until dc ps | grep -q "iex_mysql"; do
    sleep 1
  done
  # Run knex migrations inside the stack
  dc run --rm knex migrate:latest || {
    err "Migrations failed."
    exit 1
  }
  log "Migrations complete."
fi

log "Deployed. Current status:"
dc ps

# Helpful tails
log "Recent logs (bot & web):"
dc logs --since=5m bot web || true
