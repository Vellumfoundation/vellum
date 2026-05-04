# Vellum

Vellum is the protocol monorepo for a Base-settled, OP Stack-style Ethereum L3
rollup that uses ETH as native gas.

The repository is intentionally structured around production launch gates:
configuration is centralized, production placeholders fail validation, bridge
metadata is machine-checkable, and operational docs live beside the code.

## Current Phase

Phase 10: Vellum public testnet release preparation.

This phase includes:

- Central chain and environment config.
- Superbridge-compatible metadata scaffolding.
- Validation scripts that block unsafe production values.
- Documentation and runbook skeletons.
- Package scripts for lint, typecheck, validation, devnet, bridge, RPC, and release workflows.
- A Docker-managed local parent simulator and OP Stack L3 devnet.
- Live smoke tests for L3 ETH transfer and contract deployment.
- Runnable SDK examples for Viem, ethers, Wagmi, Hardhat, and Foundry.
- A strict Base Sepolia testnet readiness gate.
- A testnet artifact importer for op-deployer genesis, rollup, L1 address, and
  Superbridge handoff outputs.

## Hard Requirements

- Parent chain: Base.
- Mainnet parent chain ID: `8453`.
- Native gas token: ETH.
- EVM-compatible execution.
- Standard OP Stack-style bridge semantics wherever possible.
- No fake production addresses.
- No mock RPC responses.
- No placeholder bridge behavior in production.

## First Commands

```bash
pnpm install
pnpm validate:config
pnpm typecheck
```

Run the local L3 devnet:

```bash
pnpm devnet:setup
pnpm devnet:start
pnpm devnet:test
```

The devnet exposes L3 JSON-RPC at `http://127.0.0.1:8545`, WebSocket RPC at
`ws://127.0.0.1:8546`, and rollup RPC at `http://127.0.0.1:8547`.

Production validation is intentionally strict:

```bash
PROJECT_ENV=production pnpm validate:config
```

That command must fail until real mainnet values are supplied.

Public testnet validation is also intentionally strict:

```bash
pnpm testnet:readiness:report
pnpm testnet:chain-id
pnpm testnet:export-artifacts
TESTNET_READINESS_REQUIRE_SECRETS=1 pnpm testnet:readiness
```
