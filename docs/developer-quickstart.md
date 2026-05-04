# Developer Quickstart

Start the local L3 devnet:

```bash
pnpm devnet:start
export VELLUM_RPC_URL="http://127.0.0.1:8545"
export VELLUM_CHAIN_ID="90103"
export PRIVATE_KEY="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
```

## SDK Metadata

```bash
pnpm sdk:typecheck
```

The SDK exports Viem, Wagmi, and wallet-add-chain metadata from `sdk/src`.

## Viem And Ethers

```bash
pnpm sdk:example:viem
pnpm sdk:example:ethers
```

Both examples send a small ETH transfer, wait for the receipt, and print JSON
with the transaction hash and status.

## Hardhat

```bash
pnpm sdk:example:hardhat
```

## Foundry

```bash
cd sdk/examples/deploy-foundry
forge create src/Counter.sol:Counter \
  --rpc-url "$VELLUM_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --legacy \
  --gas-price 1000000000
```

## Wagmi

```bash
pnpm sdk:example:wagmi
```

## E2E Gate

```bash
pnpm test:e2e:sdk
```
