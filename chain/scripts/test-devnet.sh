#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"
source "$ROOT_DIR/chain/scripts/lib/devnet-common.sh"

require_command cast

bigint_lt() {
  local left="${1#"${1%%[!0]*}"}"
  local right="${2#"${2%%[!0]*}"}"

  left="${left:-0}"
  right="${right:-0}"

  if [ "${#left}" -lt "${#right}" ]; then
    return 0
  fi
  if [ "${#left}" -gt "${#right}" ]; then
    return 1
  fi
  [ "$left" \< "$right" ]
}

top_up_l1_role_account() {
  local role="$1"
  local minimum_balance_wei="${2:-500000000000000000}"
  local address balance

  address="$(get_role_address "$role")"
  balance="$(cast balance --rpc-url "$DEVNET_L1_RPC_URL" "$address")"

  if bigint_lt "$balance" "$minimum_balance_wei"; then
    log_info "Topping up devnet L1 $role account at $address"
    cast send \
      --rpc-url "$DEVNET_L1_RPC_URL" \
      --private-key "$DEVNET_DEPLOYER_PRIVATE_KEY" \
      "$address" \
      --value 1ether \
      >/dev/null
  fi
}

top_up_l1_role_account proposer
pnpm --filter @vellum/contracts build
VELLUM_RPC_URL="${VELLUM_RPC_URL:-http://127.0.0.1:8545}" \
VELLUM_E2E_REQUIRED=true \
DEVNET_PRIVATE_KEY="${DEVNET_PRIVATE_KEY:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}" \
  pnpm test:e2e
