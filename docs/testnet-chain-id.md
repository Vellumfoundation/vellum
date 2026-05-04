# Testnet Chain ID Reservation

| Field | Value |
| --- | --- |
| Environment | Public testnet candidate |
| Chain ID | `895331` |
| Hex chain ID | `0xda963` |
| Parent chain | Base Sepolia |
| Parent chain ID | `84532` |
| Status | Locally reserved, not live |

The candidate ID `895331` was conflict-checked against the chainid.network
registry on 2026-05-05. No registry entry used that ID at the time of the check.

The reservation is wired through:

- `config/project.json` under `environments.testnet.chainId`
- `chain/configs/testnet/chain.json`
- `chain/configs/testnet/genesis.json`
- `chain/configs/testnet/rollup.json`
- `bridge/configs/testnet.bridge.json`

Re-run the registry check immediately before announcing the public testnet:

```bash
pnpm testnet:chain-id
```

If a conflict appears, choose a new chain ID, update the same config surfaces,
regenerate the op-deployer artifacts, and rerun the testnet readiness gate.
