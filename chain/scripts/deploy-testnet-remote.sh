#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/testnet-common.sh"

load_testnet_env

require_command sshpass
require_command ssh
require_command rsync

require_env TESTNET_SSH_HOST
require_env TESTNET_SSH_USER
require_env TESTNET_SSH_PASSWORD
require_env TESTNET_REMOTE_DIR

"$CHAIN_DIR/scripts/prepare-testnet-runtime.sh"

remote="$TESTNET_SSH_USER@$TESTNET_SSH_HOST"
remote_dir_quoted="$(printf '%q' "$TESTNET_REMOTE_DIR")"
ssh_options=(-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=20 -o ServerAliveCountMax=3)
ssh_transport="ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=20 -o ServerAliveCountMax=3"

log_info "Creating remote Vellum testnet directories on $TESTNET_SSH_HOST"
SSHPASS="$TESTNET_SSH_PASSWORD" sshpass -e ssh "${ssh_options[@]}" "$remote" \
  "mkdir -p $remote_dir_quoted/chain/docker $remote_dir_quoted/chain/testnet/runtime"

log_info "Uploading testnet Docker compose and runtime files"
SSHPASS="$TESTNET_SSH_PASSWORD" sshpass -e rsync -az --delete \
  -e "$ssh_transport" \
  "$ROOT_DIR/chain/docker/docker-compose.testnet.yml" \
  "$remote:$TESTNET_REMOTE_DIR/chain/docker/docker-compose.testnet.yml"

SSHPASS="$TESTNET_SSH_PASSWORD" sshpass -e rsync -az --delete \
  -e "$ssh_transport" \
  "$TESTNET_RUNTIME_DIR/" \
  "$remote:$TESTNET_REMOTE_DIR/chain/testnet/runtime/"

log_info "Starting remote Vellum testnet node stack"
SSHPASS="$TESTNET_SSH_PASSWORD" sshpass -e ssh "${ssh_options[@]}" "$remote" \
  "cd $remote_dir_quoted && docker compose -f chain/docker/docker-compose.testnet.yml --env-file chain/testnet/runtime/.env pull && docker compose -f chain/docker/docker-compose.testnet.yml --env-file chain/testnet/runtime/.env up -d --remove-orphans --force-recreate && docker compose -f chain/docker/docker-compose.testnet.yml --env-file chain/testnet/runtime/.env ps"

log_success "Remote Vellum testnet stack started on $TESTNET_SSH_HOST."
