#!/usr/bin/env bash
set -euo pipefail

containers=(
  vellum-op-geth
  vellum-op-node
  vellum-op-batcher
  vellum-op-proposer
)

docker logs -f "${containers[@]}"
