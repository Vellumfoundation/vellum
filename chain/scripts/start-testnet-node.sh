#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"
echo "Checking Vellum testnet readiness before node startup..."
pnpm testnet:readiness
echo "Testnet node startup automation is still blocked until Base Sepolia deployment artifacts are finalized."
exit 1
