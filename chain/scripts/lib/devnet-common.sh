#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CHAIN_DIR="$ROOT_DIR/chain"
DEVNET_DIR="$CHAIN_DIR/devnet"
BIN_DIR="$CHAIN_DIR/bin"
DEPLOYER_DIR="$DEVNET_DIR/deployer"
SEQUENCER_DIR="$DEVNET_DIR/sequencer"
BATCHER_DIR="$DEVNET_DIR/batcher"
PROPOSER_DIR="$DEVNET_DIR/proposer"
CHALLENGER_DIR="$DEVNET_DIR/challenger"
DISPUTE_MON_DIR="$DEVNET_DIR/dispute-mon"
CONFIG_DIR="$CHAIN_DIR/configs/devnet"

DEVNET_L1_CHAIN_ID="${DEVNET_L1_CHAIN_ID:-11155111}"
DEVNET_L2_CHAIN_ID="${DEVNET_L2_CHAIN_ID:-90103}"
DEVNET_L1_RPC_URL="${DEVNET_L1_RPC_URL:-http://127.0.0.1:9545}"
DEVNET_L1_RPC_URL_DOCKER="${DEVNET_L1_RPC_URL_DOCKER:-http://host.docker.internal:9545}"
DEVNET_L1_BEACON_URL_DOCKER="${DEVNET_L1_BEACON_URL_DOCKER:-http://host.docker.internal:9545}"
DEVNET_DEPLOYER_PRIVATE_KEY="${DEVNET_DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
DEVNET_DEPLOYER_PRIVATE_KEY_NO_PREFIX="${DEVNET_DEPLOYER_PRIVATE_KEY#0x}"
DEVNET_P2P_ADVERTISE_IP="${DEVNET_P2P_ADVERTISE_IP:-127.0.0.1}"
OP_DEPLOYER="$BIN_DIR/op-deployer"

log_info() {
  printf '\033[0;34m[INFO]\033[0m %s\n' "$*"
}

log_success() {
  printf '\033[0;32m[SUCCESS]\033[0m %s\n' "$*"
}

log_warning() {
  printf '\033[1;33m[WARNING]\033[0m %s\n' "$*"
}

log_error() {
  printf '\033[0;31m[ERROR]\033[0m %s\n' "$*" >&2
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Missing required command: $1"
    exit 1
  fi
}

wait_for_rpc() {
  local url="$1"
  local method="${2:-eth_chainId}"
  local attempts="${3:-60}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS \
      -H "Content-Type: application/json" \
      --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":[]}" \
      "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  log_error "RPC $url did not become ready for $method"
  return 1
}

write_runtime_env() {
  mkdir -p "$DEVNET_DIR"
  cat > "$DEVNET_DIR/.env" << EOF
PROJECT_ENV=development
VELLUM_CHAIN_ID=$DEVNET_L2_CHAIN_ID
VELLUM_RPC_URL=http://localhost:8545
VELLUM_WS_URL=ws://localhost:8546
DEVNET_L1_CHAIN_ID=$DEVNET_L1_CHAIN_ID
DEVNET_L2_CHAIN_ID=$DEVNET_L2_CHAIN_ID
DEVNET_L1_RPC_URL=$DEVNET_L1_RPC_URL
DEVNET_L1_RPC_URL_DOCKER=$DEVNET_L1_RPC_URL_DOCKER
DEVNET_L1_BEACON_URL_DOCKER=$DEVNET_L1_BEACON_URL_DOCKER
DEVNET_DEPLOYER_PRIVATE_KEY=$DEVNET_DEPLOYER_PRIVATE_KEY_NO_PREFIX
PRIVATE_KEY=$DEVNET_DEPLOYER_PRIVATE_KEY_NO_PREFIX
P2P_ADVERTISE_IP=$DEVNET_P2P_ADVERTISE_IP
EOF
}

role_address_file() {
  printf '%s/addresses/%s_address.txt' "$DEPLOYER_DIR" "$1"
}

role_private_key_file() {
  printf '%s/addresses/%s_private_key.txt' "$DEPLOYER_DIR" "$1"
}

get_role_address() {
  cat "$(role_address_file "$1")"
}

get_role_private_key_no_prefix() {
  sed 's/^0x//' "$(role_private_key_file "$1")"
}
