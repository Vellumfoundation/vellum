#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/chain/docker/docker-compose.devnet.yml"
DEVNET_ENV="$ROOT_DIR/chain/devnet/.env"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing $COMPOSE_FILE"
  exit 1
fi

if [[ ! -f "$ROOT_DIR/chain/devnet/sequencer/genesis.json" ]] || [[ ! -f "$ROOT_DIR/chain/devnet/sequencer/rollup.json" ]]; then
  "$ROOT_DIR/chain/scripts/setup-devnet.sh"
fi

echo "Starting Vellum devnet..."
if docker compose version >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" --env-file "$DEVNET_ENV" up -d --wait op-geth op-node batcher proposer
else
  "$ROOT_DIR/chain/scripts/run-devnet-docker.sh"
fi
"$ROOT_DIR/chain/scripts/wait-devnet.sh"
