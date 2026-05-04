# Chain Parameters

| Field | Value |
| --- | --- |
| Name | Vellum |
| Slug | vellum |
| Native gas | ETH |
| Parent chain | Base |
| Parent chain ID | 8453 |
| Testnet parent | Base Sepolia |
| Testnet parent chain ID | 84532 |
| Target block time | 2 seconds |
| Bridge type | OP Stack canonical |

The candidate public testnet chain ID is `895331` (`0xda963`). It was
conflict-checked against the chainid.network registry on 2026-05-05 and is
reserved locally for the Base Sepolia testnet path. The public testnet is not
live until generated artifacts and endpoints replace every placeholder.

The final public mainnet chain ID is not selected yet. It must be
conflict-checked before mainnet launch.

Before public testnet launch, `chain/configs/testnet/*` must be generated from a
Base Sepolia op-deployer run, imported with `pnpm testnet:export-artifacts`, and
`pnpm testnet:readiness` must pass.
