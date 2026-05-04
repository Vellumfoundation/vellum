#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/explorer-common.sh"

require_command docker

cat <<EOF
Explorer reindex procedure:

1. Review docs/runbooks/explorer-reindex.md before running this in a shared environment.
2. Stop Blockscout:
   pnpm explorer:stop
3. Remove the local Blockscout database volume:
   docker volume rm $POSTGRES_VOLUME
4. Start Blockscout again:
   EXPLORER_PORT=$EXPLORER_PORT pnpm explorer:start

This script does not delete data automatically. That keeps local devnet reindexing explicit
and prevents accidental production database loss.
EOF
