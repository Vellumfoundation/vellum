#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
EXPLORER_URL="${EXPLORER_URL:-http://127.0.0.1:4000}"

cd "$ROOT_DIR"
tsx explorer/scripts/check-explorer-health.ts

cat <<EOF
Blockscout verification is enabled when the health output reports verification.ok=true.

Foundry verification URL:
  $EXPLORER_URL/api/

Example:
  forge verify-contract \\
    --verifier blockscout \\
    --verifier-url "$EXPLORER_URL/api/" \\
    <contract-address> \\
    contracts/src/TestERC20.sol:TestERC20
EOF
