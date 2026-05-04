#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CHAIN_DIR="$ROOT_DIR/chain"
TESTNET_DIR="$CHAIN_DIR/testnet"
TESTNET_DEPLOYER_DIR="${TESTNET_DEPLOYER_WORKDIR:-$TESTNET_DIR/deployer}"
TESTNET_ARTIFACT_DIR="${TESTNET_ARTIFACT_DIR:-$TESTNET_DIR/artifacts}"
TESTNET_RUNTIME_DIR="${TESTNET_RUNTIME_DIR:-$TESTNET_DIR/runtime}"
CONFIG_DIR="$CHAIN_DIR/configs/testnet"
BIN_DIR="$CHAIN_DIR/bin"
OP_DEPLOYER="$BIN_DIR/op-deployer"

TESTNET_CHAIN_ID="${TESTNET_CHAIN_ID:-895331}"
TESTNET_PARENT_CHAIN_ID="${TESTNET_PARENT_CHAIN_ID:-84532}"
TESTNET_L3_MULTICALL3_ADDRESS="${TESTNET_L3_MULTICALL3_ADDRESS:-0xcA11bde05977b3631167028862bE2a173976CA11}"

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

load_testnet_env() {
  if [ -f "$ROOT_DIR/.env.testnet" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env.testnet"
    set +a
  fi

  TESTNET_REMOTE_DIR="${TESTNET_REMOTE_DIR:-/opt/vellum}"
  TESTNET_L3_MULTICALL3_ADDRESS="${TESTNET_L3_MULTICALL3_ADDRESS:-0xcA11bde05977b3631167028862bE2a173976CA11}"
  TESTNET_RPC_HTTP_PORT="${TESTNET_RPC_HTTP_PORT:-8545}"
  TESTNET_RPC_WS_PORT="${TESTNET_RPC_WS_PORT:-8546}"
  TESTNET_ROLLUP_RPC_PORT="${TESTNET_ROLLUP_RPC_PORT:-8547}"

  local public_host="${TESTNET_PUBLIC_HOST:-${TESTNET_SSH_HOST:-localhost}}"
  export TESTNET_PUBLIC_RPC_URL="${TESTNET_PUBLIC_RPC_URL:-http://$public_host:$TESTNET_RPC_HTTP_PORT}"
  export TESTNET_WS_RPC_URL="${TESTNET_WS_RPC_URL:-ws://$public_host:$TESTNET_RPC_WS_PORT}"
  export TESTNET_EXPLORER_URL="${TESTNET_EXPLORER_URL:-http://$public_host:4000}"
  export TESTNET_STATUS_URL="${TESTNET_STATUS_URL:-http://$public_host:3001}"
  export TESTNET_L3_MULTICALL3_ADDRESS
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Missing required command: $1"
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    log_error "Missing required environment value: $name"
    log_error "Set it in $ROOT_DIR/.env.testnet"
    exit 1
  fi
}

private_key_no_prefix() {
  local value="$1"
  printf '%s' "${value#0x}"
}

address_from_private_key() {
  local value="$1"
  cast wallet address --private-key "$value"
}

chain_id_word() {
  printf "0x%064x" "$TESTNET_CHAIN_ID"
}

require_parent_rpc() {
  local observed
  observed="$(cast chain-id --rpc-url "$PARENT_RPC_URL")"
  if [ "$observed" != "$TESTNET_PARENT_CHAIN_ID" ]; then
    log_error "PARENT_RPC_URL returned chain ID $observed, expected Base Sepolia $TESTNET_PARENT_CHAIN_ID."
    exit 1
  fi
}

require_positive_parent_balance() {
  local label="$1"
  local address="$2"
  local balance
  balance="$(cast balance --rpc-url "$PARENT_RPC_URL" "$address")"
  log_info "$label $address has $(cast to-unit "$balance" ether) Base Sepolia ETH"
  if [ "$balance" = "0" ]; then
    log_error "$label has zero Base Sepolia ETH."
    exit 1
  fi
}

replace_toml_field() {
  local key="$1"
  local value="$2"
  local file="$TESTNET_DEPLOYER_DIR/intent.toml"

  if grep -qE "^[[:space:]]*$key[[:space:]]*=" "$file"; then
    sed -i.bak -E "s|^([[:space:]]*$key[[:space:]]*=).*|\\1 \"$value\"|" "$file"
  else
    printf '%s = "%s"\n' "$key" "$value" >> "$file"
  fi
}

replace_toml_number() {
  local key="$1"
  local value="$2"
  local file="$TESTNET_DEPLOYER_DIR/intent.toml"

  if grep -qE "^[[:space:]]*$key[[:space:]]*=" "$file"; then
    sed -i.bak -E "s|^([[:space:]]*$key[[:space:]]*=).*|\\1 $value|" "$file"
  else
    printf '%s = %s\n' "$key" "$value" >> "$file"
  fi
}

replace_toml_bool() {
  replace_toml_number "$1" "$2"
}

remove_toml_field() {
  local key="$1"
  local file="$TESTNET_DEPLOYER_DIR/intent.toml"
  local tmp_file="$file.tmp"

  awk -v key="$key" '
    $0 !~ "^[[:space:]]*" key "[[:space:]]*="
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

replace_top_level_toml_field() {
  local key="$1"
  local value="$2"
  local file="$TESTNET_DEPLOYER_DIR/intent.toml"
  local tmp_file="$file.tmp"

  awk -v key="$key" -v value="$value" '
    BEGIN { inserted = 0 }
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" { next }
    !inserted && $0 ~ "^\\[" {
      print key " = \"" value "\""
      inserted = 1
    }
    { print }
    END {
      if (!inserted) {
        print key " = \"" value "\""
      }
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

replace_top_level_toml_bool() {
  local key="$1"
  local value="$2"
  local file="$TESTNET_DEPLOYER_DIR/intent.toml"
  local tmp_file="$file.tmp"

  awk -v key="$key" -v value="$value" '
    BEGIN { inserted = 0 }
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" { next }
    !inserted && $0 ~ "^\\[" {
      print key " = " value
      inserted = 1
    }
    { print }
    END {
      if (!inserted) {
        print key " = " value
      }
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

remove_toml_table() {
  local table="$1"
  local file="$TESTNET_DEPLOYER_DIR/intent.toml"
  local tmp_file="$file.tmp"

  awk -v table="[$table]" '
    $0 ~ "^\\[" {
      skip = ($0 == table)
    }
    !skip { print }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}
