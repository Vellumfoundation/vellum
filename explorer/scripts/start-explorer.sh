#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/explorer-common.sh"

require_command docker
require_command curl

cd "$ROOT_DIR"

if has_docker_compose; then
  log_info "Starting Blockscout with docker compose on $EXPLORER_URL"
  EXPLORER_PORT="$EXPLORER_PORT" \
    BLOCKSCOUT_BACKEND_ENV_FILE="${BLOCKSCOUT_BACKEND_ENV_FILE:-env.example}" \
    BLOCKSCOUT_FRONTEND_ENV_FILE="${BLOCKSCOUT_FRONTEND_ENV_FILE:-frontend.env}" \
    docker compose -f "$COMPOSE_FILE" --profile phase5 up -d --wait
else
  log_warn "docker compose is unavailable; starting Blockscout with plain docker"
  ensure_network

  docker volume inspect "$POSTGRES_VOLUME" >/dev/null 2>&1 || docker volume create "$POSTGRES_VOLUME" >/dev/null

  restart_container "$POSTGRES_CONTAINER" \
    --network "$NETWORK" \
    -e POSTGRES_USER=blockscout \
    -e POSTGRES_PASSWORD=blockscout \
    -e POSTGRES_DB=blockscout \
    -v "$POSTGRES_VOLUME:/var/lib/postgresql/data" \
    postgres:17 \
    postgres -c max_connections=200 -c client_connection_check_interval=60000 >/dev/null
  wait_for_postgres 120

  restart_container "$REDIS_CONTAINER" \
    --network "$NETWORK" \
    redis:7-alpine \
    redis-server --save "" --appendonly no >/dev/null

  restart_container "$VERIFIER_CONTAINER" \
    --network "$NETWORK" \
    --env-file "$BLOCKSCOUT_DIR/smart-contract-verifier.env" \
    ghcr.io/blockscout/smart-contract-verifier:${SMART_CONTRACT_VERIFIER_DOCKER_TAG:-latest} >/dev/null

  restart_container "$BLOCKSCOUT_CONTAINER" \
    --network "$NETWORK" \
    --add-host host.docker.internal:host-gateway \
    --env-file "$BLOCKSCOUT_DIR/${BLOCKSCOUT_BACKEND_ENV_FILE:-env.example}" \
    --env-file "$BLOCKSCOUT_DIR/config/verifier.env" \
    -e DATABASE_URL=postgresql://blockscout:blockscout@"$POSTGRES_CONTAINER":5432/blockscout?ssl=false \
    -e ACCOUNT_DATABASE_URL=postgresql://blockscout:blockscout@"$POSTGRES_CONTAINER":5432/blockscout?ssl=false \
    -e ECTO_USE_SSL=false \
    -e ACCOUNT_REDIS_URL=redis://"$REDIS_CONTAINER":6379 \
    -e API_RATE_LIMIT_HAMMER_REDIS_URL=redis://"$REDIS_CONTAINER":6379/1 \
    -e MICROSERVICE_SC_VERIFIER_URL=http://"$VERIFIER_CONTAINER":8050/ \
    ghcr.io/blockscout/blockscout:${BLOCKSCOUT_DOCKER_TAG:-latest} \
    sh -c "bin/blockscout eval 'Elixir.Explorer.ReleaseTasks.create_and_migrate()' && bin/blockscout start" >/dev/null

  restart_container "$FRONTEND_CONTAINER" \
    --network "$NETWORK" \
    --env-file "$BLOCKSCOUT_DIR/${BLOCKSCOUT_FRONTEND_ENV_FILE:-frontend.env}" \
    -e NEXT_PUBLIC_API_HOST=127.0.0.1:"$EXPLORER_PORT" \
    -e NEXT_PUBLIC_APP_HOST=127.0.0.1:"$EXPLORER_PORT" \
    ghcr.io/blockscout/frontend:${FRONTEND_DOCKER_TAG:-latest} >/dev/null

  restart_container "$PROXY_CONTAINER" \
    --network "$NETWORK" \
    -e BACK_PROXY_PASS=http://"$BLOCKSCOUT_CONTAINER":4000 \
    -e FRONT_PROXY_PASS=http://"$FRONTEND_CONTAINER":3000 \
    -v "$BLOCKSCOUT_DIR/proxy:/etc/nginx/templates:ro" \
    -p "$EXPLORER_PORT":80 \
    nginx:1.27-alpine >/dev/null
fi

wait_for_http "$EXPLORER_URL/api/v2/main-page/indexing-status" 180
wait_for_http "$EXPLORER_URL/" 180
log_success "Blockscout explorer is ready at $EXPLORER_URL"
