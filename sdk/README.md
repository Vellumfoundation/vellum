# SDK

The SDK centralizes chain metadata for app developers and integration partners,
and keeps the runnable examples close to the metadata they depend on.

## Exports

- `@vellum/sdk/chains`: raw chain metadata and `wallet_addEthereumChain` payload.
- `@vellum/sdk/viem`: a Viem `defineChain` export.
- `@vellum/sdk/wagmi`: Wagmi chain and transport helpers.
- `@vellum/sdk/bridge`, `tokens`, `addresses`, `rpc`: integration metadata.

The defaults are placeholder-safe for published packages. Local, testnet, and
mainnet values come from environment variables:

```bash
export VELLUM_RPC_URL="http://127.0.0.1:8545"
export VELLUM_CHAIN_ID="90103"
export EXPLORER_URL="http://127.0.0.1:4001"
```

## Local Examples

Start the devnet first:

```bash
pnpm devnet:start
```

Use one of the funded devnet keys, then run the examples:

```bash
export PRIVATE_KEY="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"

pnpm sdk:typecheck
pnpm sdk:example:viem
pnpm sdk:example:ethers
pnpm sdk:example:hardhat
pnpm sdk:example:wagmi
```

Foundry is not a workspace package, so run it from its example directory:

```bash
cd sdk/examples/deploy-foundry
forge create src/Counter.sol:Counter \
  --rpc-url "$VELLUM_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --legacy \
  --gas-price 1000000000
```

Run the SDK example e2e gate:

```bash
pnpm test:e2e:sdk
```
