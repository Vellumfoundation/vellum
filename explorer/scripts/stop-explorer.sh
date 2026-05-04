#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/explorer-common.sh"

require_command docker

cd "$ROOT_DIR"

if has_docker_compose; then
  docker compose -f "$COMPOSE_FILE" --profile phase5 down || true
fi
stop_plain_docker_explorer

log_success "Vellum explorer stopped."
