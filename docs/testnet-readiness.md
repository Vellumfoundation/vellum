# Testnet Readiness

The public testnet target is a Base Sepolia-settled Vellum with ETH as
native gas.

The current candidate testnet chain ID is `895331` (`0xda963`). It is reserved
in local config only; do not submit wallet, explorer, or Chainlist metadata
until the public RPC and explorer are live.

Use the non-failing report while values are still being filled in:

```bash
pnpm testnet:readiness:report
```

Use the chain ID registry check whenever the candidate ID changes and again
before public announcement:

```bash
pnpm testnet:chain-id
```

After the Base Sepolia deployment run, export and import op-deployer artifacts:

```bash
pnpm testnet:export-artifacts
```

Use the launch gate when deployment secrets and public endpoints are available:

```bash
TESTNET_READINESS_REQUIRE_SECRETS=1 \
TESTNET_READINESS_LIVE=1 \
CHECK_CHAINLIST=1 \
pnpm testnet:readiness
```

Required deployment secrets:

- `PARENT_RPC_URL`
- `PARENT_WS_URL`
- `TESTNET_DEPLOYER_PRIVATE_KEY`
- `TESTNET_BATCHER_PRIVATE_KEY`
- `TESTNET_PROPOSER_PRIVATE_KEY`
- `TESTNET_SEQUENCER_PRIVATE_KEY`

The gate fails until all placeholder URLs, rollup addresses, bridge addresses,
and Superbridge handoff metadata have been replaced by real Base Sepolia
deployment artifacts.
