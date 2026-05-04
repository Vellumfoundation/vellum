#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/devnet-common.sh"

wait_for_rpc "http://127.0.0.1:8545" "eth_chainId" 120

chain_id_hex="$(cast chain-id --rpc-url http://127.0.0.1:8545)"
block_number="$(cast block-number --rpc-url http://127.0.0.1:8545)"

log_success "Vellum devnet RPC is ready."
log_info "L2 RPC: http://127.0.0.1:8545"
log_info "L2 WebSocket: ws://127.0.0.1:8546"
log_info "Rollup RPC: http://127.0.0.1:8547"
log_info "Chain ID: $chain_id_hex"
log_info "Current block: $block_number"
