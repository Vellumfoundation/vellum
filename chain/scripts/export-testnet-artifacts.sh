#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OP_DEPLOYER="$ROOT_DIR/chain/bin/op-deployer"
CHAIN_ID="${TESTNET_CHAIN_ID:-895331}"
WORKDIR="${TESTNET_DEPLOYER_WORKDIR:-$ROOT_DIR/chain/testnet/deployer}"
ARTIFACT_DIR="${TESTNET_ARTIFACT_DIR:-$ROOT_DIR/chain/testnet/artifacts}"

if [ ! -x "$OP_DEPLOYER" ]; then
  echo "Missing op-deployer at $OP_DEPLOYER. Run chain/scripts/download-op-deployer.sh first." >&2
  exit 1
fi

if [ ! -f "$WORKDIR/state.json" ]; then
  echo "Missing op-deployer state at $WORKDIR/state.json." >&2
  echo "Run op-deployer apply for the Base Sepolia testnet workdir before exporting artifacts." >&2
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"

"$OP_DEPLOYER" inspect genesis --workdir "$WORKDIR" --outfile "$ARTIFACT_DIR/genesis.json" "$CHAIN_ID"
"$OP_DEPLOYER" inspect rollup --workdir "$WORKDIR" --outfile "$ARTIFACT_DIR/rollup.json" "$CHAIN_ID"
"$OP_DEPLOYER" inspect l1 --workdir "$WORKDIR" --outfile "$ARTIFACT_DIR/l1-addresses.json" "$CHAIN_ID"

TESTNET_ARTIFACT_DIR="$ARTIFACT_DIR" pnpm testnet:import-artifacts
