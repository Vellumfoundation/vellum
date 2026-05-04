#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/devnet-common.sh"

require_command cast

mkdir -p "$DEVNET_DIR/.pids" "$DEVNET_DIR/logs"

start_docker_anvil() {
  require_command docker

  local container_name="${DEVNET_L1_ANVIL_CONTAINER:-vellum-l1-anvil}"
  local foundry_image="${DEVNET_FOUNDRY_IMAGE:-ghcr.io/foundry-rs/foundry:stable}"

  if docker ps --format '{{.Names}}' | grep -qx "$container_name"; then
    if wait_for_rpc "$DEVNET_L1_RPC_URL" "eth_chainId" 3; then
      log_success "Local parent simulator already running in Docker on $DEVNET_L1_RPC_URL"
      return 0
    fi
  fi

  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker run -d \
    --name "$container_name" \
    -p 9545:9545 \
    "$foundry_image" \
    "anvil --host 0.0.0.0 --port 9545 --chain-id $DEVNET_L1_CHAIN_ID --block-time 2 --balance 1000000" \
    >/dev/null
}

start_local_anvil() {
  require_command anvil

  nohup anvil \
    --host 0.0.0.0 \
    --port 9545 \
    --chain-id "$DEVNET_L1_CHAIN_ID" \
    --block-time 2 \
    --balance 1000000 \
    > "$DEVNET_DIR/logs/anvil.log" 2>&1 < /dev/null &

  echo "$!" > "$DEVNET_DIR/.pids/anvil.pid"
}

if [ -f "$DEVNET_DIR/.pids/anvil.pid" ]; then
  pid="$(cat "$DEVNET_DIR/.pids/anvil.pid")"
  if kill -0 "$pid" >/dev/null 2>&1; then
    if wait_for_rpc "$DEVNET_L1_RPC_URL" "eth_chainId" 3; then
      log_success "Local parent simulator already running on $DEVNET_L1_RPC_URL"
      exit 0
    fi
  fi
fi

if curl -fsS -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "$DEVNET_L1_RPC_URL" >/dev/null 2>&1; then
  log_success "Local parent simulator already reachable on $DEVNET_L1_RPC_URL"
  exit 0
fi

log_info "Starting Anvil parent simulator on $DEVNET_L1_RPC_URL"
if command -v docker >/dev/null 2>&1; then
  start_docker_anvil
else
  start_local_anvil
fi
wait_for_rpc "$DEVNET_L1_RPC_URL" "eth_chainId" 60

actual_chain_id="$(cast chain-id --rpc-url "$DEVNET_L1_RPC_URL")"
if [ "$actual_chain_id" != "$DEVNET_L1_CHAIN_ID" ]; then
  log_error "Expected parent chain ID $DEVNET_L1_CHAIN_ID, got $actual_chain_id"
  exit 1
fi

log_success "Anvil parent simulator is ready on $DEVNET_L1_RPC_URL"
