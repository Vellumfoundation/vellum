#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/testnet-common.sh"

load_testnet_env

require_command cast
require_command curl
require_command jq
require_command openssl
require_command pnpm

require_env PARENT_RPC_URL
require_env PARENT_WS_URL
require_env TESTNET_DEPLOYER_PRIVATE_KEY
require_env TESTNET_BATCHER_PRIVATE_KEY
require_env TESTNET_PROPOSER_PRIVATE_KEY
require_env TESTNET_SEQUENCER_PRIVATE_KEY
require_env TESTNET_PUBLIC_RPC_URL
require_env TESTNET_WS_RPC_URL
require_env TESTNET_EXPLORER_URL
require_env TESTNET_STATUS_URL

if [ ! -x "$OP_DEPLOYER" ]; then
  "$CHAIN_DIR/scripts/download-op-deployer.sh"
fi

require_parent_rpc

deployer_address="$(address_from_private_key "$TESTNET_DEPLOYER_PRIVATE_KEY")"
batcher_address="$(address_from_private_key "$TESTNET_BATCHER_PRIVATE_KEY")"
proposer_address="$(address_from_private_key "$TESTNET_PROPOSER_PRIVATE_KEY")"
sequencer_address="$(address_from_private_key "$TESTNET_SEQUENCER_PRIVATE_KEY")"
challenger_private_key="${TESTNET_CHALLENGER_PRIVATE_KEY:-$TESTNET_PROPOSER_PRIVATE_KEY}"
challenger_address="$(address_from_private_key "$challenger_private_key")"

admin_address="${TESTNET_ADMIN_ADDRESS:-$deployer_address}"
base_fee_vault_recipient="${TESTNET_BASE_FEE_VAULT_RECIPIENT:-$admin_address}"
l1_fee_vault_recipient="${TESTNET_L1_FEE_VAULT_RECIPIENT:-$admin_address}"
sequencer_fee_vault_recipient="${TESTNET_SEQUENCER_FEE_VAULT_RECIPIENT:-$admin_address}"
operator_fee_vault_recipient="${TESTNET_OPERATOR_FEE_VAULT_RECIPIENT:-$admin_address}"

require_positive_parent_balance "deployer" "$deployer_address"
require_positive_parent_balance "batcher" "$batcher_address"
require_positive_parent_balance "proposer" "$proposer_address"

if [ "${TESTNET_FORCE_REDEPLOY:-0}" = "1" ]; then
  log_warning "Forcing a fresh Vellum testnet deployment state"
  rm -rf "$TESTNET_DEPLOYER_DIR" "$TESTNET_ARTIFACT_DIR"
fi

mkdir -p "$TESTNET_DEPLOYER_DIR" "$TESTNET_ARTIFACT_DIR"

if [ ! -f "$TESTNET_DEPLOYER_DIR/intent.toml" ] || [ ! -f "$TESTNET_DEPLOYER_DIR/state.json" ]; then
  log_info "Initializing Base Sepolia testnet op-deployer custom intent"
  rm -rf "$TESTNET_DEPLOYER_DIR"
  mkdir -p "$TESTNET_DEPLOYER_DIR"
  "$OP_DEPLOYER" init \
    --l1-chain-id "$TESTNET_PARENT_CHAIN_ID" \
    --l2-chain-ids "$TESTNET_CHAIN_ID" \
    --workdir "$TESTNET_DEPLOYER_DIR" \
    --intent-type custom
fi

bootstrap_superchain_file="$TESTNET_DEPLOYER_DIR/bootstrap_superchain.json"
bootstrap_implementations_file="$TESTNET_DEPLOYER_DIR/bootstrap_implementations.json"

if [ ! -f "$bootstrap_superchain_file" ]; then
  log_info "Bootstrapping Vellum testnet Superchain contracts on Base Sepolia"
  "$OP_DEPLOYER" bootstrap superchain \
    --l1-rpc-url "$PARENT_RPC_URL" \
    --private-key "$(private_key_no_prefix "$TESTNET_DEPLOYER_PRIVATE_KEY")" \
    --outfile "$bootstrap_superchain_file" \
    --superchain-proxy-admin-owner "$admin_address" \
    --protocol-versions-owner "$admin_address" \
    --guardian "$admin_address"
fi

protocol_versions_proxy="$(jq -r '.protocolVersionsProxyAddress' "$bootstrap_superchain_file")"
superchain_config_proxy="$(jq -r '.superchainConfigProxyAddress' "$bootstrap_superchain_file")"
superchain_proxy_admin="$(jq -r '.proxyAdminAddress' "$bootstrap_superchain_file")"

withdrawal_delay_seconds="${TESTNET_WITHDRAWAL_DELAY_SECONDS:-60}"
preimage_challenge_period_seconds="${TESTNET_PREIMAGE_CHALLENGE_PERIOD_SECONDS:-60}"
proof_maturity_delay_seconds="${TESTNET_PROOF_MATURITY_DELAY_SECONDS:-60}"
dispute_game_finality_delay_seconds="${TESTNET_DISPUTE_GAME_FINALITY_DELAY_SECONDS:-60}"
dispute_clock_extension_seconds="${TESTNET_DISPUTE_CLOCK_EXTENSION_SECONDS:-30}"
dispute_max_clock_duration_seconds="${TESTNET_DISPUTE_MAX_CLOCK_DURATION_SECONDS:-180}"
export TESTNET_WITHDRAWAL_CHALLENGE_PERIOD_SECONDS="${TESTNET_WITHDRAWAL_CHALLENGE_PERIOD_SECONDS:-$((proof_maturity_delay_seconds + dispute_game_finality_delay_seconds))}"

if [ ! -f "$bootstrap_implementations_file" ]; then
  log_info "Bootstrapping Vellum testnet implementations and OPCM on Base Sepolia"
  "$OP_DEPLOYER" bootstrap implementations \
    --l1-rpc-url "$PARENT_RPC_URL" \
    --private-key "$(private_key_no_prefix "$TESTNET_DEPLOYER_PRIVATE_KEY")" \
    --outfile "$bootstrap_implementations_file" \
    --protocol-versions-proxy "$protocol_versions_proxy" \
    --superchain-config-proxy "$superchain_config_proxy" \
    --superchain-proxy-admin "$superchain_proxy_admin" \
    --challenger "$challenger_address" \
    --upgrade-controller "$admin_address" \
    --withdrawal-delay-seconds "$withdrawal_delay_seconds" \
    --challenge-period-seconds "$preimage_challenge_period_seconds" \
    --proof-maturity-delay-seconds "$proof_maturity_delay_seconds" \
    --dispute-game-finality-delay-seconds "$dispute_game_finality_delay_seconds" \
    --dispute-clock-extension "$dispute_clock_extension_seconds" \
    --dispute-max-clock-duration "$dispute_max_clock_duration_seconds"
fi

opcm_address="$(jq -r '.opcmAddress // .opcmV2Address' "$bootstrap_implementations_file")"

log_info "Writing testnet roles into op-deployer intent"
remove_toml_field "opcmAddress"
remove_toml_field "superchainConfigProxy"
replace_top_level_toml_bool "fundDevAccounts" "false"
replace_toml_field "id" "$(chain_id_word)"
replace_toml_field "baseFeeVaultRecipient" "$base_fee_vault_recipient"
replace_toml_field "l1FeeVaultRecipient" "$l1_fee_vault_recipient"
replace_toml_field "sequencerFeeVaultRecipient" "$sequencer_fee_vault_recipient"
replace_toml_field "operatorFeeVaultRecipient" "$operator_fee_vault_recipient"
replace_toml_number "eip1559DenominatorCanyon" "250"
replace_toml_number "eip1559Denominator" "50"
replace_toml_number "eip1559Elasticity" "6"
replace_toml_number "gasLimit" "${TESTNET_L3_GAS_LIMIT:-60000000}"
replace_toml_number "operatorFeeScalar" "0"
replace_toml_number "operatorFeeConstant" "0"
replace_toml_number "minBaseFee" "0"
replace_toml_number "daFootprintGasScalar" "0"
replace_toml_field "SuperchainProxyAdminOwner" "$admin_address"
replace_toml_field "SuperchainGuardian" "$admin_address"
replace_toml_field "ProtocolVersionsOwner" "$admin_address"
replace_toml_field "Challenger" "$challenger_address"
replace_toml_field "l1ProxyAdminOwner" "$admin_address"
replace_toml_field "l2ProxyAdminOwner" "$admin_address"
replace_toml_field "systemConfigOwner" "$admin_address"
replace_toml_field "unsafeBlockSigner" "$sequencer_address"
replace_toml_field "batcher" "$batcher_address"
replace_toml_field "proposer" "$proposer_address"
replace_toml_field "challenger" "$challenger_address"
replace_toml_field "liquidityControllerOwner" "0x0000000000000000000000000000000000000000"

log_info "Seeding op-deployer state with bootstrapped short-delay implementations"
tmp_state="$TESTNET_DEPLOYER_DIR/state.json.tmp"
jq \
  --arg superchainProxyAdminImpl "$superchain_proxy_admin" \
  --arg superchainConfigProxy "$superchain_config_proxy" \
  --arg superchainConfigImpl "$(jq -r '.superchainConfigImplAddress' "$bootstrap_superchain_file")" \
  --arg protocolVersionsProxy "$protocol_versions_proxy" \
  --arg protocolVersionsImpl "$(jq -r '.protocolVersionsImplAddress' "$bootstrap_superchain_file")" \
  --arg superchainProxyAdminOwner "$admin_address" \
  --arg superchainGuardian "$admin_address" \
  --arg protocolVersionsOwner "$admin_address" \
  --arg challenger "$challenger_address" \
  --arg opcmStandardValidator "$(jq -r '.opcmStandardValidatorAddress' "$bootstrap_implementations_file")" \
  --arg opcmUtils "$(jq -r '.opcmUtilsAddress // "0x0000000000000000000000000000000000000000"' "$bootstrap_implementations_file")" \
  --arg opcmMigrator "$(jq -r '.opcmMigratorAddress // "0x0000000000000000000000000000000000000000"' "$bootstrap_implementations_file")" \
  --arg opcmV2 "$opcm_address" \
  --arg opcmContainer "$(jq -r '.opcmContainerAddress // .opcmContractsContainerAddress // "0x0000000000000000000000000000000000000000"' "$bootstrap_implementations_file")" \
  --arg delayedWeth "$(jq -r '.delayedWETHImplAddress' "$bootstrap_implementations_file")" \
  --arg optimismPortal "$(jq -r '.optimismPortalImplAddress' "$bootstrap_implementations_file")" \
  --arg ethLockbox "$(jq -r '.ethLockboxImplAddress' "$bootstrap_implementations_file")" \
  --arg preimageOracle "$(jq -r '.preimageOracleSingletonAddress' "$bootstrap_implementations_file")" \
  --arg mips "$(jq -r '.mipsSingletonAddress' "$bootstrap_implementations_file")" \
  --arg systemConfig "$(jq -r '.systemConfigImplAddress' "$bootstrap_implementations_file")" \
  --arg l1CrossDomainMessenger "$(jq -r '.l1CrossDomainMessengerImplAddress' "$bootstrap_implementations_file")" \
  --arg l1Erc721Bridge "$(jq -r '.l1ERC721BridgeImplAddress' "$bootstrap_implementations_file")" \
  --arg l1StandardBridge "$(jq -r '.l1StandardBridgeImplAddress' "$bootstrap_implementations_file")" \
  --arg optimismMintableErc20Factory "$(jq -r '.optimismMintableERC20FactoryImplAddress' "$bootstrap_implementations_file")" \
  --arg disputeGameFactory "$(jq -r '.disputeGameFactoryImplAddress' "$bootstrap_implementations_file")" \
  --arg anchorStateRegistry "$(jq -r '.anchorStateRegistryImplAddress' "$bootstrap_implementations_file")" \
  --arg faultDisputeGame "$(jq -r '.faultDisputeGameImplAddress' "$bootstrap_implementations_file")" \
  --arg permissionedDisputeGame "$(jq -r '.permissionedDisputeGameImplAddress' "$bootstrap_implementations_file")" \
  --arg zkDisputeGame "$(jq -r '.zkDisputeGameImplAddress // "0x0000000000000000000000000000000000000000"' "$bootstrap_implementations_file")" \
  --arg storageSetter "$(jq -r '.storageSetterImplAddress // "0x0000000000000000000000000000000000000000"' "$bootstrap_implementations_file")" \
  --arg superFaultDisputeGame "$(jq -r '.superFaultDisputeGameImplAddress // "0x0000000000000000000000000000000000000000"' "$bootstrap_implementations_file")" \
  --arg superPermissionedDisputeGame "$(jq -r '.superPermissionedDisputeGameImplAddress // "0x0000000000000000000000000000000000000000"' "$bootstrap_implementations_file")" \
  '
    .superchainContracts = {
      SuperchainProxyAdminImpl: $superchainProxyAdminImpl,
      SuperchainConfigProxy: $superchainConfigProxy,
      SuperchainConfigImpl: $superchainConfigImpl,
      ProtocolVersionsProxy: $protocolVersionsProxy,
      ProtocolVersionsImpl: $protocolVersionsImpl
    }
    | .superchainRoles = {
      SuperchainProxyAdminOwner: $superchainProxyAdminOwner,
      SuperchainGuardian: $superchainGuardian,
      ProtocolVersionsOwner: $protocolVersionsOwner,
      Challenger: $challenger
    }
    | .implementationsDeployment = {
      OpcmStandardValidatorImpl: $opcmStandardValidator,
      OpcmUtilsImpl: $opcmUtils,
      OpcmMigratorImpl: $opcmMigrator,
      OpcmV2Impl: $opcmV2,
      OpcmContainerImpl: $opcmContainer,
      DelayedWethImpl: $delayedWeth,
      OptimismPortalImpl: $optimismPortal,
      EthLockboxImpl: $ethLockbox,
      PreimageOracleImpl: $preimageOracle,
      MipsImpl: $mips,
      SystemConfigImpl: $systemConfig,
      L1CrossDomainMessengerImpl: $l1CrossDomainMessenger,
      L1Erc721BridgeImpl: $l1Erc721Bridge,
      L1StandardBridgeImpl: $l1StandardBridge,
      OptimismMintableErc20FactoryImpl: $optimismMintableErc20Factory,
      DisputeGameFactoryImpl: $disputeGameFactory,
      AnchorStateRegistryImpl: $anchorStateRegistry,
      FaultDisputeGameImpl: $faultDisputeGame,
      PermissionedDisputeGameImpl: $permissionedDisputeGame,
      ZkDisputeGameImpl: $zkDisputeGame,
      StorageSetterImpl: $storageSetter,
      SuperFaultDisputeGameImpl: $superFaultDisputeGame,
      SuperPermissionedDisputeGameImpl: $superPermissionedDisputeGame
    }
  ' "$TESTNET_DEPLOYER_DIR/state.json" > "$tmp_state"
mv "$tmp_state" "$TESTNET_DEPLOYER_DIR/state.json"

if ! jq -e --arg id "$(chain_id_word)" '.opChainDeployments[]? | select(.id == $id)' "$TESTNET_DEPLOYER_DIR/state.json" >/dev/null 2>&1; then
  log_info "Deploying Vellum testnet contracts to Base Sepolia"
  "$OP_DEPLOYER" apply \
    --workdir "$TESTNET_DEPLOYER_DIR" \
    --l1-rpc-url "$PARENT_RPC_URL" \
    --private-key "$(private_key_no_prefix "$TESTNET_DEPLOYER_PRIVATE_KEY")"
else
  log_success "op-deployer state already contains Vellum testnet deployment."
fi

log_info "Exporting testnet genesis, rollup, and L1 bridge addresses"
if ! "$OP_DEPLOYER" inspect genesis --workdir "$TESTNET_DEPLOYER_DIR" "$(chain_id_word)" > "$TESTNET_ARTIFACT_DIR/genesis.json"; then
  "$OP_DEPLOYER" inspect genesis --workdir "$TESTNET_DEPLOYER_DIR" "$TESTNET_CHAIN_ID" > "$TESTNET_ARTIFACT_DIR/genesis.json"
fi

if ! "$OP_DEPLOYER" inspect rollup --workdir "$TESTNET_DEPLOYER_DIR" "$(chain_id_word)" > "$TESTNET_ARTIFACT_DIR/rollup.json"; then
  "$OP_DEPLOYER" inspect rollup --workdir "$TESTNET_DEPLOYER_DIR" "$TESTNET_CHAIN_ID" > "$TESTNET_ARTIFACT_DIR/rollup.json"
fi

if ! "$OP_DEPLOYER" inspect l1 --workdir "$TESTNET_DEPLOYER_DIR" "$(chain_id_word)" > "$TESTNET_ARTIFACT_DIR/l1-addresses.json"; then
  "$OP_DEPLOYER" inspect l1 --workdir "$TESTNET_DEPLOYER_DIR" "$TESTNET_CHAIN_ID" > "$TESTNET_ARTIFACT_DIR/l1-addresses.json"
fi
cp "$TESTNET_DEPLOYER_DIR/state.json" "$TESTNET_ARTIFACT_DIR/state.json"

portal_address="$(jq -r '.OptimismPortalProxy // empty' "$TESTNET_ARTIFACT_DIR/l1-addresses.json")"
if [ -n "$portal_address" ]; then
  live_proof_maturity_delay="$(cast call --rpc-url "$PARENT_RPC_URL" "$portal_address" 'proofMaturityDelaySeconds()(uint256)' 2>/dev/null | awk '{print $1}' || true)"
  live_dispute_game_finality_delay="$(cast call --rpc-url "$PARENT_RPC_URL" "$portal_address" 'disputeGameFinalityDelaySeconds()(uint256)' 2>/dev/null | awk '{print $1}' || true)"

  if [[ "$live_proof_maturity_delay" =~ ^[0-9]+$ ]] && [[ "$live_dispute_game_finality_delay" =~ ^[0-9]+$ ]]; then
    export TESTNET_PROOF_MATURITY_DELAY_SECONDS="$live_proof_maturity_delay"
    export TESTNET_DISPUTE_GAME_FINALITY_DELAY_SECONDS="$live_dispute_game_finality_delay"
    if [ "$live_proof_maturity_delay" -ge "$live_dispute_game_finality_delay" ]; then
      export TESTNET_WITHDRAWAL_CHALLENGE_PERIOD_SECONDS="$live_proof_maturity_delay"
    else
      export TESTNET_WITHDRAWAL_CHALLENGE_PERIOD_SECONDS="$live_dispute_game_finality_delay"
    fi
    log_info "Using live portal withdrawal timing: proof=$TESTNET_PROOF_MATURITY_DELAY_SECONDS finality=$TESTNET_DISPUTE_GAME_FINALITY_DELAY_SECONDS challenge=$TESTNET_WITHDRAWAL_CHALLENGE_PERIOD_SECONDS seconds"
  else
    log_warning "Could not read live portal withdrawal timing; using configured TESTNET_WITHDRAWAL_CHALLENGE_PERIOD_SECONDS."
  fi
fi

export TESTNET_ARTIFACT_DIR
export TESTNET_L3_MULTICALL3_ADDRESS
pnpm testnet:import-artifacts
pnpm bridge:validate:testnet
pnpm testnet:runtime
pnpm testnet:readiness:report
PROJECT_ENV=testnet pnpm validate:config

log_success "Vellum testnet contracts and runtime artifacts are ready."
log_info "Run: pnpm testnet:start"
