#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/devnet-common.sh"

require_command cast
require_command curl
require_command jq
require_command openssl

write_runtime_env
"$CHAIN_DIR/scripts/start-local-parent.sh"
"$CHAIN_DIR/scripts/download-op-deployer.sh"

mkdir -p "$DEPLOYER_DIR" "$SEQUENCER_DIR" "$BATCHER_DIR" "$PROPOSER_DIR" "$CHALLENGER_DIR" "$DISPUTE_MON_DIR" "$CONFIG_DIR"

if [ "${DEVNET_FORCE_REDEPLOY:-0}" = "1" ]; then
  log_warning "DEVNET_FORCE_REDEPLOY=1 set; removing previous devnet deployment state."
  rm -rf "$DEPLOYER_DIR" "$SEQUENCER_DIR" "$BATCHER_DIR" "$PROPOSER_DIR" "$CHALLENGER_DIR" "$DISPUTE_MON_DIR"
  mkdir -p "$DEPLOYER_DIR" "$SEQUENCER_DIR" "$BATCHER_DIR" "$PROPOSER_DIR" "$CHALLENGER_DIR" "$DISPUTE_MON_DIR"
fi

generate_role_key() {
  local role="$1"
  mkdir -p "$DEPLOYER_DIR/addresses"
  if [ -f "$(role_address_file "$role")" ] && [ -f "$(role_private_key_file "$role")" ]; then
    return 0
  fi

  local wallet_output
  wallet_output="$(cast wallet new)"
  echo "$wallet_output" | awk '/Address:/ { print $2 }' > "$(role_address_file "$role")"
  echo "$wallet_output" | awk '/Private key:/ { print $3 }' > "$(role_private_key_file "$role")"
}

generate_addresses() {
  log_info "Generating devnet role keys"
  for role in \
    admin \
    base_fee_vault_recipient \
    l1_fee_vault_recipient \
    sequencer_fee_vault_recipient \
    operator_fee_vault_recipient \
    system_config_owner \
    unsafe_block_signer \
    batcher \
    proposer \
    challenger; do
    generate_role_key "$role"
  done
  chmod 600 "$DEPLOYER_DIR"/addresses/*_private_key.txt
}

fund_l1_role_accounts() {
  log_info "Funding devnet L1 service accounts"
  for role in batcher proposer challenger admin system_config_owner; do
    cast send \
      --rpc-url "$DEVNET_L1_RPC_URL" \
      --private-key "$DEVNET_DEPLOYER_PRIVATE_KEY" \
      "$(get_role_address "$role")" \
      --value 10ether \
      >/dev/null
  done
}

replace_toml_field() {
  local key="$1"
  local value="$2"
  local file="$DEPLOYER_DIR/.deployer/intent.toml"

  if grep -qE "^[[:space:]]*$key[[:space:]]*=" "$file"; then
    sed -i.bak -E "s|^([[:space:]]*$key[[:space:]]*=).*|\\1 \"$value\"|" "$file"
  else
    printf '%s = "%s"\n' "$key" "$value" >> "$file"
  fi
}

replace_toml_bool() {
  local key="$1"
  local value="$2"
  local file="$DEPLOYER_DIR/.deployer/intent.toml"

  if grep -qE "^[[:space:]]*$key[[:space:]]*=" "$file"; then
    sed -i.bak -E "s|^([[:space:]]*$key[[:space:]]*=).*|\\1 $value|" "$file"
  else
    printf '%s = %s\n' "$key" "$value" >> "$file"
  fi
}

replace_top_level_toml_field() {
  local key="$1"
  local value="$2"
  local file="$DEPLOYER_DIR/.deployer/intent.toml"
  local tmp_file="$file.tmp"

  awk -v key="$key" -v value="$value" '
    BEGIN { inserted = 0 }
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" { next }
    !inserted && $0 ~ "^\\[" {
      print key " = \"" value "\""
      inserted = 1
    }
    { print }
    END {
      if (!inserted) {
        print key " = \"" value "\""
      }
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

replace_top_level_toml_bool() {
  local key="$1"
  local value="$2"
  local file="$DEPLOYER_DIR/.deployer/intent.toml"
  local tmp_file="$file.tmp"

  awk -v key="$key" -v value="$value" '
    BEGIN { inserted = 0 }
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" { next }
    !inserted && $0 ~ "^\\[" {
      print key " = " value
      inserted = 1
    }
    { print }
    END {
      if (!inserted) {
        print key " = " value
      }
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

init_deployer() {
  if [ -f "$DEPLOYER_DIR/.deployer/state.json" ] && [ -f "$DEPLOYER_DIR/.deployer/intent.toml" ]; then
    log_success "op-deployer state already exists; reusing $DEPLOYER_DIR/.deployer"
    return 0
  fi

  log_info "Initializing op-deployer intent"
  (
    cd "$DEPLOYER_DIR"
    rm -rf .deployer
    "$OP_DEPLOYER" init \
      --l1-chain-id "$DEVNET_L1_CHAIN_ID" \
      --l2-chain-ids "$DEVNET_L2_CHAIN_ID" \
      --workdir .deployer \
      --intent-type standard-overrides
  )
}

bootstrap_superchain() {
  mkdir -p "$DEPLOYER_DIR/.deployer"

  local bootstrap_superchain_file="$DEPLOYER_DIR/.deployer/bootstrap_superchain.json"
  local bootstrap_implementations_file="$DEPLOYER_DIR/.deployer/bootstrap_implementations.json"
  local opcm_address=""

  if [ -f "$bootstrap_implementations_file" ]; then
    opcm_address="$(jq -r '.opcmAddress // .opcmV2Address // empty' "$bootstrap_implementations_file")"
    if [ -n "$opcm_address" ] && [ "$(cast code "$opcm_address" --rpc-url "$DEVNET_L1_RPC_URL")" != "0x" ]; then
      log_success "Bootstrapped OPCM already exists at $opcm_address"
      return 0
    fi
    log_warning "Existing bootstrap files do not match live parent state; bootstrapping again."
    rm -f "$bootstrap_superchain_file" "$bootstrap_implementations_file"
  fi

  log_info "Bootstrapping local Superchain contracts and OPCM"
  (
    cd "$DEPLOYER_DIR"
    "$OP_DEPLOYER" bootstrap superchain \
      --l1-rpc-url "$DEVNET_L1_RPC_URL" \
      --private-key "$DEVNET_DEPLOYER_PRIVATE_KEY_NO_PREFIX" \
      --outfile .deployer/bootstrap_superchain.json \
      --superchain-proxy-admin-owner "$(get_role_address admin)" \
      --protocol-versions-owner "$(get_role_address admin)" \
      --guardian "$(get_role_address admin)"
  )

  local protocol_versions_proxy superchain_config_proxy superchain_proxy_admin
  protocol_versions_proxy="$(jq -r '.protocolVersionsProxyAddress' "$bootstrap_superchain_file")"
  superchain_config_proxy="$(jq -r '.superchainConfigProxyAddress' "$bootstrap_superchain_file")"
  superchain_proxy_admin="$(jq -r '.proxyAdminAddress' "$bootstrap_superchain_file")"

  (
    cd "$DEPLOYER_DIR"
    "$OP_DEPLOYER" bootstrap implementations \
      --l1-rpc-url "$DEVNET_L1_RPC_URL" \
      --private-key "$DEVNET_DEPLOYER_PRIVATE_KEY_NO_PREFIX" \
      --outfile .deployer/bootstrap_implementations.json \
      --protocol-versions-proxy "$protocol_versions_proxy" \
      --superchain-config-proxy "$superchain_config_proxy" \
      --superchain-proxy-admin "$superchain_proxy_admin" \
      --challenger "$(get_role_address challenger)" \
      --upgrade-controller "$(get_role_address admin)"
  )

  opcm_address="$(jq -r '.opcmAddress // .opcmV2Address' "$bootstrap_implementations_file")"
  log_success "Bootstrapped local OPCM at $opcm_address"
}

update_intent() {
  log_info "Writing devnet role addresses into op-deployer intent"
  local l2_chain_id_word
  l2_chain_id_word="$(printf "0x%064x" "$DEVNET_L2_CHAIN_ID")"
  local opcm_address
  opcm_address="$(jq -r '.opcmAddress // .opcmV2Address' "$DEPLOYER_DIR/.deployer/bootstrap_implementations.json")"
  local superchain_config_proxy
  superchain_config_proxy="$(jq -r '.superchainConfigProxyAddress' "$DEPLOYER_DIR/.deployer/bootstrap_superchain.json")"

  replace_top_level_toml_field "opcmAddress" "$opcm_address"
  replace_top_level_toml_field "superchainConfigProxy" "$superchain_config_proxy"
  replace_toml_field "id" "$l2_chain_id_word"
  replace_toml_field "baseFeeVaultRecipient" "$(get_role_address base_fee_vault_recipient)"
  replace_toml_field "l1FeeVaultRecipient" "$(get_role_address l1_fee_vault_recipient)"
  replace_toml_field "sequencerFeeVaultRecipient" "$(get_role_address sequencer_fee_vault_recipient)"
  replace_toml_field "operatorFeeVaultRecipient" "$(get_role_address operator_fee_vault_recipient)"
  replace_toml_field "l1ProxyAdminOwner" "$(get_role_address admin)"
  replace_toml_field "l2ProxyAdminOwner" "$(get_role_address admin)"
  replace_toml_field "systemConfigOwner" "$(get_role_address system_config_owner)"
  replace_toml_field "unsafeBlockSigner" "$(get_role_address unsafe_block_signer)"
  replace_toml_field "batcher" "$(get_role_address batcher)"
  replace_toml_field "proposer" "$(get_role_address proposer)"
  replace_toml_field "challenger" "$(get_role_address challenger)"
  replace_toml_field "liquidityControllerOwner" "0x0000000000000000000000000000000000000000"
  replace_top_level_toml_bool "fundDevAccounts" "true"
}

deploy_contracts() {
  if jq -e '.opChainDeployments[0]' "$DEPLOYER_DIR/.deployer/state.json" >/dev/null 2>&1; then
    log_success "op-deployer state already contains a chain deployment."
    return 0
  fi

  log_info "Deploying OP Stack contracts to local parent simulator"
  (
    cd "$DEPLOYER_DIR"
    "$OP_DEPLOYER" apply \
      --workdir .deployer \
      --l1-rpc-url "$DEVNET_L1_RPC_URL" \
      --private-key "$DEVNET_DEPLOYER_PRIVATE_KEY_NO_PREFIX"
  )
}

inspect_config() {
  log_info "Generating genesis and rollup config"
  local chain_id_word
  chain_id_word="$(printf "0x%064x" "$DEVNET_L2_CHAIN_ID")"

  (
    cd "$DEPLOYER_DIR"
    if ! "$OP_DEPLOYER" inspect genesis --workdir .deployer "$chain_id_word" > .deployer/genesis.json; then
      "$OP_DEPLOYER" inspect genesis --workdir .deployer "$DEVNET_L2_CHAIN_ID" > .deployer/genesis.json
    fi

    if ! "$OP_DEPLOYER" inspect rollup --workdir .deployer "$chain_id_word" > .deployer/rollup.json; then
      "$OP_DEPLOYER" inspect rollup --workdir .deployer "$DEVNET_L2_CHAIN_ID" > .deployer/rollup.json
    fi
  )

  cp "$DEPLOYER_DIR/.deployer/genesis.json" "$CONFIG_DIR/genesis.json"
  cp "$DEPLOYER_DIR/.deployer/rollup.json" "$CONFIG_DIR/rollup.json"
}

jq_first() {
  local file="$1"
  shift
  local value=""

  for query in "$@"; do
    value="$(jq -r "$query // empty" "$file")"
    if [ -n "$value" ] && [ "$value" != "null" ]; then
      printf '%s' "$value"
      return 0
    fi
  done

  printf '0x0000000000000000000000000000000000000000'
}

write_public_artifacts() {
  log_info "Writing public devnet artifacts"
  local state="$DEPLOYER_DIR/.deployer/state.json"
  local portal standard_bridge messenger system_config output_oracle dispute_game_factory

  portal="$(jq_first "$state" '.opChainDeployments[0].OptimismPortalProxy' '.opChainDeployments[0].optimismPortalProxyAddress' '.opChainDeployments[0].optimismPortalProxy')"
  standard_bridge="$(jq_first "$state" '.opChainDeployments[0].L1StandardBridgeProxy' '.opChainDeployments[0].l1StandardBridgeProxyAddress' '.opChainDeployments[0].l1StandardBridgeProxy')"
  messenger="$(jq_first "$state" '.opChainDeployments[0].L1CrossDomainMessengerProxy' '.opChainDeployments[0].l1CrossDomainMessengerProxyAddress' '.opChainDeployments[0].l1CrossDomainMessengerProxy')"
  system_config="$(jq_first "$state" '.opChainDeployments[0].SystemConfigProxy' '.opChainDeployments[0].systemConfigProxyAddress' '.opChainDeployments[0].systemConfigProxy')"
  output_oracle="$(jq_first "$state" '.opChainDeployments[0].L2OutputOracleProxy' '.opChainDeployments[0].l2OutputOracleProxyAddress' '.opChainDeployments[0].l2OutputOracleProxy')"
  dispute_game_factory="$(jq_first "$state" '.opChainDeployments[0].DisputeGameFactoryProxy' '.opChainDeployments[0].disputeGameFactoryProxyAddress' '.opChainDeployments[0].disputeGameFactoryProxy')"

  cat > "$CONFIG_DIR/addresses.json" << EOF
{
  "parentChain": {
    "portal": "$portal",
    "standardBridge": "$standard_bridge",
    "crossDomainMessenger": "$messenger",
    "systemConfig": "$system_config",
    "l2OutputOracle": "$output_oracle",
    "disputeGameFactory": "$dispute_game_factory"
  },
  "l3": {
    "standardBridge": "0x4200000000000000000000000000000000000010",
    "crossDomainMessenger": "0x4200000000000000000000000000000000000007",
    "weth": "0x4200000000000000000000000000000000000006",
    "multicall3": "0x0000000000000000000000000000000000000000"
  }
}
EOF
}

setup_services() {
  log_info "Preparing service runtime files"
  cp "$DEPLOYER_DIR/.deployer/genesis.json" "$SEQUENCER_DIR/genesis.json"
  cp "$DEPLOYER_DIR/.deployer/rollup.json" "$SEQUENCER_DIR/rollup.json"
  cp "$DEPLOYER_DIR/.deployer/genesis.json" "$CHALLENGER_DIR/genesis.json"
  cp "$DEPLOYER_DIR/.deployer/rollup.json" "$CHALLENGER_DIR/rollup.json"
  cp "$DEPLOYER_DIR/.deployer/state.json" "$BATCHER_DIR/state.json"
  cp "$DEPLOYER_DIR/.deployer/state.json" "$PROPOSER_DIR/state.json"

  if [ ! -f "$SEQUENCER_DIR/jwt.txt" ]; then
    openssl rand -hex 32 > "$SEQUENCER_DIR/jwt.txt"
    chmod 600 "$SEQUENCER_DIR/jwt.txt"
  fi

  cat > "$SEQUENCER_DIR/.env" << EOF
UNSAFE_BLOCK_SIGNER_PRIVATE_KEY=$(get_role_private_key_no_prefix unsafe_block_signer)
EOF

  local batch_inbox game_factory
  batch_inbox="$(jq_first "$BATCHER_DIR/state.json" '.opChainDeployments[0].SystemConfigProxy' '.opChainDeployments[0].systemConfigProxyAddress' '.opChainDeployments[0].BatchInboxAddress' '.opChainDeployments[0].batchInboxAddress')"
  game_factory="$(jq_first "$PROPOSER_DIR/state.json" '.opChainDeployments[0].DisputeGameFactoryProxy' '.opChainDeployments[0].disputeGameFactoryProxyAddress' '.opChainDeployments[0].disputeGameFactoryProxy')"

  cat > "$BATCHER_DIR/.env" << EOF
OP_BATCHER_L1_ETH_RPC=$DEVNET_L1_RPC_URL_DOCKER
OP_BATCHER_L2_ETH_RPC=http://vellum-op-geth:8545
OP_BATCHER_ROLLUP_RPC=http://vellum-op-node:8547
OP_BATCHER_PRIVATE_KEY=$(get_role_private_key_no_prefix batcher)
OP_BATCHER_POLL_INTERVAL=1s
OP_BATCHER_SUB_SAFETY_MARGIN=6
OP_BATCHER_NUM_CONFIRMATIONS=1
OP_BATCHER_SAFE_ABORT_NONCE_TOO_LOW_COUNT=3
OP_BATCHER_THROTTLE_UNSAFE_DA_BYTES_LOWER_THRESHOLD=0
OP_BATCHER_INBOX_ADDRESS=$batch_inbox
EOF

  cat > "$PROPOSER_DIR/.env" << EOF
OP_PROPOSER_L1_ETH_RPC=$DEVNET_L1_RPC_URL_DOCKER
OP_PROPOSER_ROLLUP_RPC=http://vellum-op-node:8547
OP_PROPOSER_GAME_FACTORY_ADDRESS=$game_factory
OP_PROPOSER_PRIVATE_KEY=$(get_role_private_key_no_prefix proposer)
OP_PROPOSER_POLL_INTERVAL=20s
OP_PROPOSER_GAME_TYPE=1
OP_PROPOSER_PROPOSAL_INTERVAL=20s
EOF

  cat > "$CHALLENGER_DIR/.env" << EOF
OP_CHALLENGER_L1_ETH_RPC=$DEVNET_L1_RPC_URL_DOCKER
OP_CHALLENGER_L1_BEACON=$DEVNET_L1_BEACON_URL_DOCKER
OP_CHALLENGER_GAME_FACTORY_ADDRESS=$game_factory
OP_CHALLENGER_PRIVATE_KEY=$(get_role_private_key_no_prefix challenger)
EOF
}

generate_addresses
fund_l1_role_accounts
init_deployer
bootstrap_superchain
update_intent
deploy_contracts
inspect_config
write_public_artifacts
setup_services

pnpm validate:config >/dev/null

log_success "Devnet setup complete."
log_info "Run: pnpm devnet:start"
