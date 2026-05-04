#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXPLORER_DIR="$ROOT_DIR/explorer"
BLOCKSCOUT_DIR="$EXPLORER_DIR/blockscout"
COMPOSE_FILE="$BLOCKSCOUT_DIR/docker-compose.yml"
NETWORK="${VELLUM_EXPLORER_NETWORK:-vellum-explorer}"
EXPLORER_PORT="${EXPLORER_PORT:-4000}"
EXPLORER_URL="${EXPLORER_URL:-http://127.0.0.1:$EXPLORER_PORT}"
POSTGRES_CONTAINER="${VELLUM_EXPLORER_POSTGRES_CONTAINER:-vellum-explorer-postgres}"
REDIS_CONTAINER="${VELLUM_EXPLORER_REDIS_CONTAINER:-vellum-explorer-redis}"
VERIFIER_CONTAINER="${VELLUM_EXPLORER_VERIFIER_CONTAINER:-vellum-explorer-verifier}"
BLOCKSCOUT_CONTAINER="${VELLUM_EXPLORER_BLOCKSCOUT_CONTAINER:-vellum-explorer-blockscout}"
FRONTEND_CONTAINER="${VELLUM_EXPLORER_FRONTEND_CONTAINER:-vellum-explorer-frontend}"
PROXY_CONTAINER="${VELLUM_EXPLORER_PROXY_CONTAINER:-vellum-explorer-proxy}"
POSTGRES_VOLUME="${VELLUM_EXPLORER_POSTGRES_VOLUME:-vellum_blockscout_postgres}"

log_info() {
  printf '\033[0;34m[INFO]\033[0m %s\n' "$*"
}

log_success() {
  printf '\033[0;32m[SUCCESS]\033[0m %s\n' "$*"
}

log_warn() {
  printf '\033[0;33m[WARN]\033[0m %s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

has_docker_compose() {
  docker compose version >/dev/null 2>&1
}

wait_for_http() {
  local url="$1"
  local timeout_seconds="${2:-120}"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    if [ "$(( $(date +%s) - started_at ))" -ge "$timeout_seconds" ]; then
      echo "Timed out waiting for $url" >&2
      return 1
    fi
    sleep 2
  done
}

wait_for_postgres() {
  local timeout_seconds="${1:-120}"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U blockscout -d blockscout >/dev/null 2>&1; then
      return 0
    fi
    if [ "$(( $(date +%s) - started_at ))" -ge "$timeout_seconds" ]; then
      echo "Timed out waiting for $POSTGRES_CONTAINER" >&2
      docker logs --tail 80 "$POSTGRES_CONTAINER" >&2 || true
      return 1
    fi
    sleep 2
  done
}

ensure_network() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
}

restart_container() {
  local name="$1"
  shift
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" "$@"
}

stop_plain_docker_explorer() {
  docker rm -f "$PROXY_CONTAINER" "$FRONTEND_CONTAINER" "$BLOCKSCOUT_CONTAINER" "$VERIFIER_CONTAINER" "$REDIS_CONTAINER" "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
}
