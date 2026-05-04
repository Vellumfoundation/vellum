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

- Parent portal: `0xaa6cd4e8f66353795f1db576a11dc53e43b96693`
- Parent standard bridge: `0xf15415450ac69240398a73b7219e747464e2ab9b`
- Parent cross-domain messenger: `0xea278ec097cd451450ede208b1b74c589332bf5d`
- Parent system config: `0x3fbad88da0da7e266f67451084aa82d07b00c688`
- Parent dispute game factory: `0x468b4d368ecb3e71be4fed843282c53d51809407`
- Parent L2 output oracle: `0x0000000000000000000000000000000000000000`
- L3 standard bridge: `0x4200000000000000000000000000000000000010`
- L3 cross-domain messenger: `0x4200000000000000000000000000000000000007`
- L3 WETH: `0x4200000000000000000000000000000000000006`
- L3 Multicall3: `0xcA11bde05977b3631167028862bE2a173976CA11`

## Withdrawal Timing

- Withdrawal challenge period: 120 seconds
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

## Custom Behavior

No custom behavior. ETH is the native gas token, ERC-20 bridging uses standard
OP Stack bridge paths, and no custom gas token behavior is planned.
