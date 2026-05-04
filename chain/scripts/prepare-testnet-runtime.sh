#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/testnet-common.sh"

load_testnet_env

require_command jq
require_command openssl
require_command cast

require_env PARENT_RPC_URL
require_env PARENT_WS_URL
require_env TESTNET_BATCHER_PRIVATE_KEY
require_env TESTNET_PROPOSER_PRIVATE_KEY
require_env TESTNET_SEQUENCER_PRIVATE_KEY

challenger_private_key="${TESTNET_CHALLENGER_PRIVATE_KEY:-$TESTNET_PROPOSER_PRIVATE_KEY}"

for file in "$CONFIG_DIR/genesis.json" "$CONFIG_DIR/rollup.json" "$CONFIG_DIR/addresses.json" "$CONFIG_DIR/chain.json"; do
  if [ ! -f "$file" ]; then
    log_error "Missing testnet config: $file"
    exit 1
  fi
done

configured_chain_id="$(jq -r '.chainId' "$CONFIG_DIR/chain.json")"
if [ "$configured_chain_id" != "$TESTNET_CHAIN_ID" ]; then
  log_error "Testnet chain config has chain ID $configured_chain_id, expected $TESTNET_CHAIN_ID."
  exit 1
fi

batch_inbox_address="$(jq -r '.batch_inbox_address' "$CONFIG_DIR/rollup.json")"
game_factory_address="$(jq -r '.parentChain.disputeGameFactory' "$CONFIG_DIR/addresses.json")"

if [ -z "$batch_inbox_address" ] || [ "$batch_inbox_address" = "0x0000000000000000000000000000000000000000" ]; then
  log_error "Missing rollup batch inbox address."
  exit 1
fi

if [ -z "$game_factory_address" ] || [ "$game_factory_address" = "0x0000000000000000000000000000000000000000" ]; then
  log_error "Missing DisputeGameFactory address."
  exit 1
fi

submitter_parent_rpc_url="${TESTNET_SUBMITTER_PARENT_RPC_URL:-${TESTNET_BATCHER_PARENT_RPC_URL:-$PARENT_RPC_URL}}"
if ! cast rpc --rpc-url "$submitter_parent_rpc_url" eth_blobBaseFee >/dev/null 2>&1; then
  submitter_parent_rpc_url="${TESTNET_SUBMITTER_PARENT_RPC_FALLBACK_URL:-https://base-sepolia-rpc.publicnode.com}"
  log_warning "Configured parent RPC does not expose eth_blobBaseFee; using submitter RPC fallback for runtime services."
fi

if ! cast rpc --rpc-url "$submitter_parent_rpc_url" eth_blobBaseFee >/dev/null 2>&1; then
  log_error "Submitter parent RPC must expose eth_blobBaseFee for current OP Stack batcher/proposer fee estimation."
  exit 1
fi

runtime_parent_rpc_url="${TESTNET_NODE_PARENT_RPC_URL:-$submitter_parent_rpc_url}"
runtime_parent_beacon_url="${TESTNET_NODE_PARENT_BEACON_URL:-${PARENT_BEACON_URL:-$runtime_parent_rpc_url}}"

mkdir -p "$TESTNET_RUNTIME_DIR/sequencer" "$TESTNET_RUNTIME_DIR/batcher" "$TESTNET_RUNTIME_DIR/proposer" "$TESTNET_RUNTIME_DIR/challenger/prestates"
cp "$CONFIG_DIR/genesis.json" "$TESTNET_RUNTIME_DIR/sequencer/genesis.json"
cp "$CONFIG_DIR/rollup.json" "$TESTNET_RUNTIME_DIR/sequencer/rollup.json"
cp "$CONFIG_DIR/rollup.json" "$TESTNET_RUNTIME_DIR/proposer/rollup.json"
cp "$CONFIG_DIR/genesis.json" "$TESTNET_RUNTIME_DIR/challenger/genesis.json"
cp "$CONFIG_DIR/rollup.json" "$TESTNET_RUNTIME_DIR/challenger/rollup.json"
cp "$CONFIG_DIR/addresses.json" "$TESTNET_RUNTIME_DIR/addresses.json"

cat > "$TESTNET_RUNTIME_DIR/parent-chain-config.json" << EOF
{
  "chainId": $TESTNET_PARENT_CHAIN_ID,
  "homesteadBlock": 0,
  "eip150Block": 0,
  "eip155Block": 0,
  "eip158Block": 0,
  "byzantiumBlock": 0,
  "constantinopleBlock": 0,
  "petersburgBlock": 0,
  "istanbulBlock": 0,
  "berlinBlock": 0,
  "londonBlock": 0,
  "terminalTotalDifficulty": 0,
  "mergeNetsplitBlock": 0,
  "shanghaiTime": 0,
  "cancunTime": 0,
  "blobSchedule": {
    "cancun": {
      "target": 3,
      "max": 6,
      "baseFeeUpdateFraction": 3338477
    }
  }
}
EOF

if [ ! -f "$TESTNET_RUNTIME_DIR/sequencer/jwt.txt" ]; then
  openssl rand -hex 32 > "$TESTNET_RUNTIME_DIR/sequencer/jwt.txt"
fi

cat > "$TESTNET_RUNTIME_DIR/.env" << EOF
PROJECT_ENV=testnet
VELLUM_CHAIN_ID=$TESTNET_CHAIN_ID
VELLUM_RPC_URL=http://localhost:$TESTNET_RPC_HTTP_PORT
VELLUM_WS_URL=ws://localhost:$TESTNET_RPC_WS_PORT
VELLUM_ROLLUP_RPC_URL=http://localhost:$TESTNET_ROLLUP_RPC_PORT
PARENT_RPC_URL=$runtime_parent_rpc_url
PARENT_WS_URL=$PARENT_WS_URL
PARENT_BEACON_URL=$runtime_parent_beacon_url
TESTNET_RPC_HTTP_PORT=$TESTNET_RPC_HTTP_PORT
TESTNET_RPC_WS_PORT=$TESTNET_RPC_WS_PORT
TESTNET_ROLLUP_RPC_PORT=$TESTNET_ROLLUP_RPC_PORT
EOF

cat > "$TESTNET_RUNTIME_DIR/sequencer/.env" << EOF
UNSAFE_BLOCK_SIGNER_PRIVATE_KEY=$(private_key_no_prefix "$TESTNET_SEQUENCER_PRIVATE_KEY")
EOF

cat > "$TESTNET_RUNTIME_DIR/batcher/.env" << EOF
OP_BATCHER_L1_ETH_RPC=$submitter_parent_rpc_url
OP_BATCHER_L2_ETH_RPC=http://op-geth:8545
OP_BATCHER_ROLLUP_RPC=http://op-node:8547
OP_BATCHER_PRIVATE_KEY=$(private_key_no_prefix "$TESTNET_BATCHER_PRIVATE_KEY")
OP_BATCHER_POLL_INTERVAL=${TESTNET_BATCHER_POLL_INTERVAL:-6s}
OP_BATCHER_SUB_SAFETY_MARGIN=${TESTNET_BATCHER_SUB_SAFETY_MARGIN:-12}
OP_BATCHER_NUM_CONFIRMATIONS=${TESTNET_BATCHER_NUM_CONFIRMATIONS:-2}
OP_BATCHER_SAFE_ABORT_NONCE_TOO_LOW_COUNT=3
OP_BATCHER_THROTTLE_UNSAFE_DA_BYTES_LOWER_THRESHOLD=0
OP_BATCHER_INBOX_ADDRESS=$batch_inbox_address
EOF

cat > "$TESTNET_RUNTIME_DIR/proposer/.env" << EOF
OP_PROPOSER_L1_ETH_RPC=$submitter_parent_rpc_url
OP_PROPOSER_ROLLUP_RPC=http://op-node:8547
OP_PROPOSER_GAME_FACTORY_ADDRESS=$game_factory_address
OP_PROPOSER_PRIVATE_KEY=$(private_key_no_prefix "$TESTNET_PROPOSER_PRIVATE_KEY")
OP_PROPOSER_POLL_INTERVAL=${TESTNET_PROPOSER_POLL_INTERVAL:-60s}
OP_PROPOSER_GAME_TYPE=${TESTNET_PROPOSER_GAME_TYPE:-1}
OP_PROPOSER_PROPOSAL_INTERVAL=${TESTNET_PROPOSER_PROPOSAL_INTERVAL:-120s}
EOF

cat > "$TESTNET_RUNTIME_DIR/challenger/.env" << EOF
OP_CHALLENGER_L1_ETH_RPC=$submitter_parent_rpc_url
OP_CHALLENGER_L1_BEACON=$runtime_parent_beacon_url
OP_CHALLENGER_GAME_FACTORY_ADDRESS=$game_factory_address
OP_CHALLENGER_PRIVATE_KEY=$(private_key_no_prefix "$challenger_private_key")
EOF

chmod 600 "$TESTNET_RUNTIME_DIR/.env" "$TESTNET_RUNTIME_DIR/parent-chain-config.json" "$TESTNET_RUNTIME_DIR/sequencer/.env" "$TESTNET_RUNTIME_DIR/batcher/.env" "$TESTNET_RUNTIME_DIR/proposer/.env" "$TESTNET_RUNTIME_DIR/challenger/.env" "$TESTNET_RUNTIME_DIR/sequencer/jwt.txt"

log_success "Prepared testnet runtime files in $TESTNET_RUNTIME_DIR."
