#!/usr/bin/env bash
set -euo pipefail

docker ps \
  --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
  | awk 'NR == 1 || $1 ~ /^(vellum|project-l3)-/'
