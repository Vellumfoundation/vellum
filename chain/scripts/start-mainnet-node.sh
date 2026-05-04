#!/usr/bin/env bash
set -euo pipefail

echo "Mainnet node startup is blocked until production configs pass validation."
PROJECT_ENV=production pnpm validate:config
echo "Validation passed. Add system-specific op-geth/op-node startup here."
