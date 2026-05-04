#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"
pnpm --filter @vellum/contracts build
VELLUM_RPC_URL="${VELLUM_RPC_URL:-http://127.0.0.1:8545}" \
VELLUM_E2E_REQUIRED=true \
DEVNET_PRIVATE_KEY="${DEVNET_PRIVATE_KEY:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}" \
  pnpm test:e2e
