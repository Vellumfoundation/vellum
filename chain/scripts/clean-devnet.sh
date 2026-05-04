#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/devnet-common.sh"

"$CHAIN_DIR/scripts/stop-devnet.sh" || true
if docker compose version >/dev/null 2>&1; then
  docker compose -f "$ROOT_DIR/chain/docker/docker-compose.devnet.yml" down -v --remove-orphans || true
fi
docker rm -f \
  vellum-op-proposer vellum-op-batcher vellum-op-node vellum-op-geth vellum-op-challenger \
  project-l3-op-proposer project-l3-op-batcher project-l3-op-node project-l3-op-geth project-l3-op-challenger \
  >/dev/null 2>&1 || true
docker volume rm vellum_op_geth_data project-l3_op_geth_data >/dev/null 2>&1 || true
docker network rm vellum-devnet project-l3-devnet >/dev/null 2>&1 || true
rm -rf "$DEVNET_DIR"

log_success "Vellum devnet runtime data removed."
