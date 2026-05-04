# Chain

This folder contains chain configuration, OP Stack runtime scripts, generated
genesis files, rollup configuration, deployment address artifacts, and node
container definitions.

The current files include the local OP Stack devnet workflow plus validation
gates for public testnet and production artifacts.

## Environments

- `devnet`: local development configuration. By default this uses a
  Docker-managed Anvil parent-chain simulator with Sepolia chain ID `11155111`,
  because the current `op-deployer` release only supports known parent chain
  IDs for OPCM lookup. This keeps the first loop free and local while
  Base/Base Sepolia remain the required public testnet and mainnet parents.
- `testnet`: public testnet configuration targeting Base Sepolia as parent.
- `mainnet`: production configuration targeting Base mainnet as parent.

## Local Devnet

```bash
pnpm devnet:setup
pnpm devnet:start
pnpm devnet:test
pnpm devnet:stop
```

`pnpm devnet:start` runs setup automatically if artifacts are missing.

The local endpoints are:

- L1 simulator RPC: `http://127.0.0.1:9545`
- L3 execution RPC: `http://127.0.0.1:8545`
- L3 execution WebSocket: `ws://127.0.0.1:8546`
- L3 rollup RPC: `http://127.0.0.1:8547`

Generated runtime files live under `chain/devnet/` and are ignored by git because
they contain local private keys. Public artifacts are copied into
`chain/configs/devnet/`.

The Docker image defaults are pinned in `chain/scripts/run-devnet-docker.sh` and
can be overridden with `OP_GETH_IMAGE`, `OP_NODE_IMAGE`, `OP_BATCHER_IMAGE`, and
`OP_PROPOSER_IMAGE` when testing a new OP Stack release.

## Safety Rules

- Do not change chain ID after public launch.
- Do not change genesis after public launch.
- Do not use a custom gas token.
- Do not publish production configs with zero bridge addresses.
- Keep OP Stack system/predeploy behavior as standard as possible.

## Public Testnet Artifacts

After a Base Sepolia `op-deployer apply` completes, export the generated
genesis, rollup, and L1 address artifacts:

```bash
TESTNET_DEPLOYER_WORKDIR=chain/testnet/deployer pnpm testnet:export-artifacts
```

The importer normalizes those artifacts into `chain/configs/testnet/*` and the
testnet Superbridge package under `bridge/superbridge/testnet`.
