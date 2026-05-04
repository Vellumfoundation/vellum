#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/testnet-common.sh"

load_testnet_env

if [ -n "${TESTNET_SSH_HOST:-}" ]; then
  "$CHAIN_DIR/scripts/deploy-testnet-remote.sh"
  exit 0
fi

require_command docker

"$CHAIN_DIR/scripts/prepare-testnet-runtime.sh"

docker compose \
  -f "$ROOT_DIR/chain/docker/docker-compose.testnet.yml" \
  --env-file "$TESTNET_RUNTIME_DIR/.env" \
  up -d --remove-orphans --force-recreate

log_success "Vellum testnet node stack started locally."
