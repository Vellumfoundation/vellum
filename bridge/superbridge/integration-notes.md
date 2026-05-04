# Superbridge Integration Notes

## Chain

- Name: Vellum
- Slug: vellum
- Native gas token: ETH
- Parent chain: Base
- Parent chain ID: 8453
- Bridge type: OP Stack canonical

## Package Files

- Chain metadata: `chain-metadata.json`
- Bridge addresses: `bridge-addresses.json`
- Token list: `token-list.json`
- Icon asset: `assets/icon.png`
- Logo asset: `assets/logo.svg`

## URLs

- Public RPC: `https://rpc.vellum.example`
- WebSocket RPC: `wss://rpc.vellum.example/ws`
- Explorer: `https://explorer.vellum.example`
- Status page: `https://status.vellum.example`

## Bridge Contract Addresses

Machine-readable contract addresses are published in `bridge-addresses.json`.
The package currently permits zero addresses only as development placeholders.

Required parent chain contracts:

- Optimism portal
- Standard bridge
- Cross-domain messenger
- System config
- L2 output oracle or dispute game factory, depending on the deployed proof system

Required L3 contracts:

- Standard bridge
- Cross-domain messenger
- WETH predeploy
- Multicall3, if deployed

## Withdrawal Timing

- Withdrawal challenge period: TODO before external handoff
- Proof maturity delay: TODO before external handoff
- Dispute game finality delay: TODO before external handoff

## Test Transactions

- ETH deposit: TODO before external handoff
- ETH withdrawal: TODO before external handoff
- ERC-20 deposit: TODO before external handoff
- ERC-20 withdrawal: TODO before external handoff

## Contacts

- Security contact: TODO before external handoff
- Incident contact: TODO before external handoff
- Mainnet launch date: TODO before external handoff

## Status

This is a Phase 1 handoff package. Contract addresses, final chain ID, withdrawal
challenge period, test transactions, launch date, and support contacts must be
filled before external integration review.

## Required Before Handoff

- Replace every zero address with deployed contract addresses.
- Publish public RPC and WebSocket URLs.
- Publish explorer URL.
- Publish icon and logo assets.
- Document withdrawal challenge period.
- Link successful ETH deposit transaction.
- Link successful ETH withdrawal transaction.
- Link successful ERC-20 deposit and withdrawal transactions.
- Confirm no custom gas token behavior.
- Confirm contract deployment has been tested with Foundry and Hardhat.

## Custom Behavior

None planned. Any deviation from standard OP Stack bridge semantics must be
documented here before testnet or mainnet launch.

## Confirmations

- ETH is the native gas token.
- ERC-20 bridging uses standard OP Stack bridge paths.
- Contract deployment is enabled and covered by devnet tests.
- Deposits and withdrawals are covered by devnet tests.
- No custom behavior is planned for bridge proofs, token wrappers, or gas token handling.
