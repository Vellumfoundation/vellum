# Testnet Deployment Artifacts

Phase 9 turns a Base Sepolia op-deployer run into committed testnet launch
artifacts.

## Inputs

The importer expects these files in `TESTNET_ARTIFACT_DIR`, defaulting to
`chain/testnet/artifacts`:

- `genesis.json` from `op-deployer inspect genesis`
- `rollup.json` from `op-deployer inspect rollup`
- `l1-addresses.json` from `op-deployer inspect l1`

It also requires public service URLs and the deployed L3 Multicall3 address:

```bash
export TESTNET_PUBLIC_RPC_URL=https://...
export TESTNET_WS_RPC_URL=wss://...
export TESTNET_EXPLORER_URL=https://...
export TESTNET_STATUS_URL=https://...
export TESTNET_L3_MULTICALL3_ADDRESS=0x...
```

Set `TESTNET_WITHDRAWAL_CHALLENGE_PERIOD_SECONDS` before the Superbridge handoff.

## Export From op-deployer

After `op-deployer apply` has completed for Base Sepolia, export and import the
generated artifacts in one command:

```bash
TESTNET_DEPLOYER_WORKDIR=chain/testnet/deployer \
TESTNET_ARTIFACT_DIR=chain/testnet/artifacts \
pnpm testnet:export-artifacts
```

The wrapper runs:

```bash
op-deployer inspect genesis --workdir "$TESTNET_DEPLOYER_WORKDIR" 895331
op-deployer inspect rollup --workdir "$TESTNET_DEPLOYER_WORKDIR" 895331
op-deployer inspect l1 --workdir "$TESTNET_DEPLOYER_WORKDIR" 895331
pnpm testnet:import-artifacts
```

## Written Files

The importer writes:

- `chain/configs/testnet/chain.json`
- `chain/configs/testnet/genesis.json`
- `chain/configs/testnet/rollup.json`
- `chain/configs/testnet/addresses.json`
- `config/project.json` under `environments.testnet`
- `bridge/superbridge/testnet/chain-metadata.json`
- `bridge/superbridge/testnet/bridge-addresses.json`
- `bridge/superbridge/testnet/token-list.json`
- `bridge/superbridge/testnet/integration-notes.md`

The raw op-deployer workdir and export directory are ignored by git. Commit the
normalized config outputs after review.

## Gates

Run these after import:

```bash
pnpm bridge:validate:testnet
pnpm testnet:readiness:report
pnpm testnet:validate
```

The strict readiness gate still requires deployment secrets and live RPC checks:

```bash
TESTNET_READINESS_REQUIRE_SECRETS=1 \
TESTNET_READINESS_LIVE=1 \
CHECK_CHAINLIST=1 \
pnpm testnet:readiness
```
