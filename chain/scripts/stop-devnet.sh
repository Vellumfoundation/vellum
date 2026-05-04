#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/devnet-common.sh"

if docker compose version >/dev/null 2>&1 && [ -f "$DEVNET_DIR/.env" ]; then
  docker compose -f "$ROOT_DIR/chain/docker/docker-compose.devnet.yml" --env-file "$DEVNET_DIR/.env" down || true
else
  docker rm -f \
    vellum-op-proposer vellum-op-batcher vellum-op-node vellum-op-geth vellum-op-challenger \
    project-l3-op-proposer project-l3-op-batcher project-l3-op-node project-l3-op-geth project-l3-op-challenger \
    >/dev/null 2>&1 || true
fi
docker rm -f vellum-l1-anvil project-l3-l1-anvil >/dev/null 2>&1 || true

if [ -f "$DEVNET_DIR/.pids/anvil.pid" ]; then
  pid="$(cat "$DEVNET_DIR/.pids/anvil.pid")"
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" || true
  fi
  rm -f "$DEVNET_DIR/.pids/anvil.pid"
fi

log_success "Vellum devnet stopped."
