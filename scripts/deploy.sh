#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT/scripts/compose.sh"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
TARGET="${1:-frontend}"

cd "$ROOT"

case "$TARGET" in
  frontend)
    SERVICES=(techspar-frontend)
    ;;
  backend)
    SERVICES=(techspar-backend)
    ;;
  all)
    SERVICES=(techspar-backend techspar-frontend caddy)
    ;;
  status)
    exec "$COMPOSE" -f "$COMPOSE_FILE" ps
    ;;
  *)
    echo "Usage: $0 {frontend|backend|all|status}" >&2
    exit 2
    ;;
esac

"$COMPOSE" -f "$COMPOSE_FILE" build "${SERVICES[@]}"
"$COMPOSE" -f "$COMPOSE_FILE" up -d --force-recreate "${SERVICES[@]}"
"$COMPOSE" -f "$COMPOSE_FILE" ps "${SERVICES[@]}"
