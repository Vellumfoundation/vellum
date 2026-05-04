# Superbridge Testnet Integration Notes

## Chain

- Name: Vellum Testnet
- Slug: vellum-testnet
- Native gas token: ETH
- Parent chain: Base Sepolia
- Parent chain ID: 84532
- Bridge type: OP Stack canonical

## Package Files

- Chain metadata: `chain-metadata.json`
- Bridge addresses: `bridge-addresses.json`
- Token list: `token-list.json`
- Icon asset: `assets/icon.png`
- Logo asset: `assets/logo.svg`

## URLs

- Public RPC: `http://104.219.250.77:8545`
- WebSocket RPC: `ws://104.219.250.77:8546`
- Explorer: `http://104.219.250.77:4000`
- Status page: `http://104.219.250.77:3001`

## Bridge Contract Addresses

- Parent portal: `0x1df1869a8958826edb13e1e937c37c98793ac0e5`
- Parent standard bridge: `0x0a1f76a5ff7b98316eedb2c7f4cb1a869e3dfde5`
- Parent cross-domain messenger: `0x9fa30b9f5673bec9899d116441b6b813d6b3e329`
- Parent system config: `0x0aa4050db8374da25eae0660b30b763cd5eaf054`
- Parent dispute game factory: `0x783eeffe1f47619d5b4a35cfa95c11eb76ad2701`
- Parent L2 output oracle: `0x0000000000000000000000000000000000000000`
- L3 standard bridge: `0x4200000000000000000000000000000000000010`
- L3 cross-domain messenger: `0x4200000000000000000000000000000000000007`
- L3 WETH: `0x4200000000000000000000000000000000000006`
- L3 Multicall3: `0xcA11bde05977b3631167028862bE2a173976CA11`

## Withdrawal Timing

- Withdrawal challenge period: 60 seconds
- Proof maturity delay: 60 seconds
- Dispute game finality delay: 60 seconds

The live portal timing is the source of truth for this testnet deployment.
Metadata should match the longer live portal delay, not a local smoke test
target.

## Test Transactions

- ETH deposit: TODO before external handoff
- ETH withdrawal initiated: TODO before external handoff
- ETH withdrawal proof: TODO before external handoff
- ETH withdrawal finalization: pending until proof maturity delay has elapsed
- ERC-20 deposit: TODO before external handoff
- ERC-20 withdrawal: TODO before external handoff

## Contacts

- Security contact: TODO before external handoff
- Incident contact: TODO before external handoff

## Custom Behavior

No custom behavior. ETH is the native gas token, ERC-20 bridging uses standard
OP Stack bridge paths, and no custom gas token behavior is planned.
