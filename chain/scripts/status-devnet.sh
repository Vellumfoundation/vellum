#!/usr/bin/env bash
set -euo pipefail

docker ps \
  --filter "name=vellum-" \
  --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
