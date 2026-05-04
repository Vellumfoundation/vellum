#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

"$ROOT_DIR/chain/scripts/setup-devnet.sh"
echo "Generated devnet genesis at chain/configs/devnet/genesis.json"
