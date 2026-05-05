# Explorer

The explorer target is Blockscout unless a better production reason appears.

Required features:

- Blocks and transactions.
- Address pages.
- ERC-20, ERC-721, and ERC-1155 token pages.
- Contract verification.
- API.
- Health endpoint.
- Indexing lag monitoring.

Local devnet runtime:

```bash
pnpm devnet:start
EXPLORER_PORT=4001 pnpm explorer:start
EXPLORER_URL=http://127.0.0.1:4001 pnpm explorer:health
EXPLORER_URL=http://127.0.0.1:4001 VELLUM_EXPLORER_REQUIRED=true pnpm exec tsx --test tests/e2e/explorer.indexing.spec.ts
```

Port `4000` is the default Blockscout port. Use `EXPLORER_PORT` and
`EXPLORER_URL` when another local service already owns that port.

Public testnet runtime:

```bash
EXPLORER_PORT=4000 \
EXPLORER_URL=http://104.219.250.77:4000 \
BLOCKSCOUT_BACKEND_ENV_FILE=env.testnet \
BLOCKSCOUT_FRONTEND_ENV_FILE=frontend.testnet.env \
pnpm explorer:start
```

Health check:

```bash
EXPLORER_URL=http://104.219.250.77:4000 \
VELLUM_RPC_URL=http://104.219.250.77:8545 \
pnpm explorer:health
```

Current public testnet explorer:

```text
http://104.219.250.77:4000
```
