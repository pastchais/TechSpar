#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT/scripts/compose.sh"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
ACTION="${1:-deploy}"
TARGET="${2:-frontend}"
TAIL_LINES="${3:-120}"

cd "$ROOT"

services_for() {
  case "$1" in
    frontend)
      echo "techspar-frontend"
      ;;
    backend)
      echo "techspar-backend"
      ;;
    caddy)
      echo "caddy"
      ;;
    all)
      echo "techspar-backend techspar-frontend caddy"
      ;;
    *)
      echo ""
      return 1
      ;;
  esac
}

deploy_services() {
  local target="$1"
  local services="$2"
  local up_flags="-d --force-recreate"

  if [ "$target" != "all" ]; then
    up_flags="$up_flags --no-deps"
  fi

  # shellcheck disable=SC2086
  "$COMPOSE" -f "$COMPOSE_FILE" build $services
  # shellcheck disable=SC2086
  "$COMPOSE" -f "$COMPOSE_FILE" up $up_flags $services
  # shellcheck disable=SC2086
  "$COMPOSE" -f "$COMPOSE_FILE" ps $services
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/deploy.sh deploy  {frontend|backend|caddy|all}
  ./scripts/deploy.sh update  {frontend|backend|caddy|all}
  ./scripts/deploy.sh restart {frontend|backend|caddy|all}
  ./scripts/deploy.sh start   {frontend|backend|caddy|all}
  ./scripts/deploy.sh stop    {frontend|backend|caddy|all}
  ./scripts/deploy.sh logs    {frontend|backend|caddy|all} [tail]
  ./scripts/deploy.sh ps
  ./scripts/deploy.sh status
  ./scripts/deploy.sh pull
EOF
}

case "$ACTION" in
  deploy)
    SERVICES=$(services_for "$TARGET") || { usage >&2; exit 2; }
    deploy_services "$TARGET" "$SERVICES"
    ;;
  update)
    SERVICES=$(services_for "$TARGET") || { usage >&2; exit 2; }
    git -C "$ROOT" pull --ff-only
    deploy_services "$TARGET" "$SERVICES"
    ;;
  restart)
    SERVICES=$(services_for "$TARGET") || { usage >&2; exit 2; }
    # shellcheck disable=SC2086
    "$COMPOSE" -f "$COMPOSE_FILE" restart $SERVICES
    # shellcheck disable=SC2086
    "$COMPOSE" -f "$COMPOSE_FILE" ps $SERVICES
    ;;
  start)
    SERVICES=$(services_for "$TARGET") || { usage >&2; exit 2; }
    # shellcheck disable=SC2086
    "$COMPOSE" -f "$COMPOSE_FILE" up -d $SERVICES
    # shellcheck disable=SC2086
    "$COMPOSE" -f "$COMPOSE_FILE" ps $SERVICES
    ;;
  stop)
    SERVICES=$(services_for "$TARGET") || { usage >&2; exit 2; }
    # shellcheck disable=SC2086
    "$COMPOSE" -f "$COMPOSE_FILE" stop $SERVICES
    # shellcheck disable=SC2086
    "$COMPOSE" -f "$COMPOSE_FILE" ps $SERVICES
    ;;
  logs)
    SERVICES=$(services_for "$TARGET") || { usage >&2; exit 2; }
    # shellcheck disable=SC2086
    exec "$COMPOSE" -f "$COMPOSE_FILE" logs --tail="$TAIL_LINES" $SERVICES
    ;;
  ps|status)
    exec "$COMPOSE" -f "$COMPOSE_FILE" ps
    ;;
  pull)
    exec git -C "$ROOT" pull --ff-only
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
