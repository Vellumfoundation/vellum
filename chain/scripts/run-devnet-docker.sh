#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/devnet-common.sh"

require_command docker

network="vellum-devnet"
volume="vellum_op_geth_data"
op_geth_image="${OP_GETH_IMAGE:-us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth:v1.101702.1}"
op_node_image="${OP_NODE_IMAGE:-us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:v1.17.0}"
op_batcher_image="${OP_BATCHER_IMAGE:-us-docker.pkg.dev/oplabs-tools-artifacts/images/op-batcher:v1.16.7}"
op_proposer_image="${OP_PROPOSER_IMAGE:-us-docker.pkg.dev/oplabs-tools-artifacts/images/op-proposer:v1.16.2}"

docker network inspect "$network" >/dev/null 2>&1 || docker network create "$network" >/dev/null
docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null

restart_container() {
  local name="$1"
  shift
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" "$@"
}

log_info "Starting op-geth container"
restart_container vellum-op-geth \
  --network "$network" \
  --add-host host.docker.internal:host-gateway \
  -p 8545:8545 \
  -p 8546:8546 \
  -p 8551:8551 \
  --env-file "$DEVNET_DIR/.env" \
  --env-file "$SEQUENCER_DIR/.env" \
  -v "$SEQUENCER_DIR:/workspace" \
  -v "$volume:/workspace/op-geth-data" \
  -w /workspace \
  --entrypoint /bin/sh \
  "$op_geth_image" \
  -c '
    set -e
    if [ ! -d /workspace/op-geth-data/geth/chaindata ]; then
      echo "Initializing op-geth datadir..."
      geth init --datadir=/workspace/op-geth-data --state.scheme=hash /workspace/genesis.json
    fi
    exec geth \
      --datadir=/workspace/op-geth-data \
      --http \
      --http.addr=0.0.0.0 \
      --http.port=8545 \
      --http.api=eth,net,web3,debug,txpool \
      --http.vhosts=* \
      --http.corsdomain=* \
      --ws \
      --ws.addr=0.0.0.0 \
      --ws.port=8546 \
      --ws.api=eth,net,web3,debug,txpool \
      --ws.origins=* \
      --authrpc.addr=0.0.0.0 \
      --authrpc.port=8551 \
      --authrpc.jwtsecret=/workspace/jwt.txt \
      --authrpc.vhosts=* \
      --syncmode=full \
      --gcmode=archive \
      --rollup.disabletxpoolgossip=true
  ' >/dev/null

wait_for_rpc "http://127.0.0.1:8545" "eth_chainId" 120

log_info "Starting op-node container"
restart_container vellum-op-node \
  --network "$network" \
  --add-host host.docker.internal:host-gateway \
  -p 8547:8547 \
  -p 9222:9222 \
  --env-file "$DEVNET_DIR/.env" \
  --env-file "$SEQUENCER_DIR/.env" \
  -v "$SEQUENCER_DIR:/workspace" \
  -w /workspace \
  "$op_node_image" \
  op-node \
    --l1="$DEVNET_L1_RPC_URL_DOCKER" \
    --l1.beacon="$DEVNET_L1_BEACON_URL_DOCKER" \
    --l1.beacon.ignore=true \
    --l1.trustrpc=true \
    --l2=http://vellum-op-geth:8551 \
    --l2.jwt-secret=/workspace/jwt.txt \
    --rollup.config=/workspace/rollup.json \
    --sequencer.enabled=true \
    --sequencer.stopped=false \
    --sequencer.max-safe-lag=3600 \
    --verifier.l1-confs=0 \
    --p2p.disable \
    --p2p.sequencer.key="$(get_role_private_key_no_prefix unsafe_block_signer)" \
    --rpc.addr=0.0.0.0 \
    --rpc.port=8547 \
    --rpc.enable-admin \
    --log.level=info \
    --log.format=json >/dev/null

wait_for_rpc "http://127.0.0.1:8547" "optimism_syncStatus" 120

log_info "Starting op-batcher container"
restart_container vellum-op-batcher \
  --network "$network" \
  --add-host host.docker.internal:host-gateway \
  --env-file "$DEVNET_DIR/.env" \
  --env-file "$BATCHER_DIR/.env" \
  -v "$BATCHER_DIR:/workspace" \
  -w /workspace \
  "$op_batcher_image" \
  op-batcher \
    --rpc.addr=0.0.0.0 \
    --rpc.port=8548 \
    --rpc.enable-admin \
    --max-channel-duration=1 \
    --data-availability-type=calldata \
    --resubmission-timeout=30s \
    --log.level=info \
    --log.format=json >/dev/null

log_info "Starting op-proposer container"
restart_container vellum-op-proposer \
  --network "$network" \
  --add-host host.docker.internal:host-gateway \
  --env-file "$DEVNET_DIR/.env" \
  --env-file "$PROPOSER_DIR/.env" \
  -v "$PROPOSER_DIR:/workspace" \
  -w /workspace \
  "$op_proposer_image" \
  op-proposer \
    --rpc.port=8560 \
    --rollup-rpc=http://vellum-op-node:8547 \
    --allow-non-finalized=true \
    --wait-node-sync=true \
    --log.level=info \
    --log.format=json >/dev/null

log_success "OP Stack containers are running."
