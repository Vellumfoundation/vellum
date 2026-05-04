# Contracts

Custom contracts are intentionally minimal. The canonical OP Stack bridge remains
the bridge of record; these contracts support metadata, token mapping discovery,
testnet utilities, and developer test coverage.

## Contracts

- `TokenBridgeRegistry.sol`: non-custodial parent-token to L3-token mapping registry.
- `L3SystemConfigRegistry.sol`: onchain publication of chain/config hashes.
- `GasPriceOracleReader.sol`: small reader for standard OP Stack gas predeploys.
- `Faucet.sol`: testnet-only ETH faucet.
- `TestERC20.sol`, `TestERC721.sol`, `TestERC1155.sol`: devnet/testnet fixtures.

## Production Rules

- Do not deploy `Faucet.sol` on mainnet unless deliberately approved.
- Do not put bridge custody logic in custom contracts.
- Transfer ownership of registries to the production multisig before launch.
