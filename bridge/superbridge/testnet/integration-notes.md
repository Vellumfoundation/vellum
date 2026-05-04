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

- Withdrawal challenge period: 604800 seconds
- Proof maturity delay: 604800 seconds
- Dispute game finality delay: 302400 seconds

The live portal timing is the source of truth for this testnet deployment. The
metadata value matches the longer live portal delay, not the short local smoke
test target.

## Test Transactions

- ETH deposit: `0xbc937a6b4c4af72729986a73e5811dacba051c1f271cca61aa5893d0745bceb4`
- ETH withdrawal initiated: `0xd43dc858dad5a251578fea7bb9a43f659edbdc7ff1db917eba6d52a6caee7273`
- ETH withdrawal proof: `0xcd2493c187e25bcd4195a7cf8d30ce9d26375bd559811ec9a8126cb52bd5d61d`
- ETH withdrawal finalization: pending until proof maturity delay has elapsed
- ERC-20 deposit: TODO before external handoff
- ERC-20 withdrawal: TODO before external handoff

## Contacts

- Security contact: TODO before external handoff
- Incident contact: TODO before external handoff

## Custom Behavior

No custom behavior. ETH is the native gas token, ERC-20 bridging uses standard
OP Stack bridge paths, and no custom gas token behavior is planned.
