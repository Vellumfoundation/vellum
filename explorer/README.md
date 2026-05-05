# Explorer

Blockscout is the default explorer target.

Start a local explorer against the devnet:

```bash
pnpm devnet:start
EXPLORER_PORT=4001 pnpm explorer:start
EXPLORER_URL=http://127.0.0.1:4001 pnpm explorer:health
```

Use `EXPLORER_PORT=4000` on machines where port `4000` is free. The start
script uses Docker Compose when available and falls back to plain Docker when
the Docker Compose plugin is not installed.

Start the public testnet explorer against the deployed Vellum RPC:

```bash
EXPLORER_PORT=4000 \
EXPLORER_URL=http://104.219.250.77:4000 \
BLOCKSCOUT_BACKEND_ENV_FILE=env.testnet \
BLOCKSCOUT_FRONTEND_ENV_FILE=frontend.testnet.env \
pnpm explorer:start
```

The testnet Blockscout env files target chain ID `895331`, ETH native gas, and
the host RPC ports `8545` and `8546`.

The root URL serves the Blockscout frontend. API requests under `/api` are
proxied to the Blockscout backend on the same host and port.

The Blockscout API is expected at:

- `GET /api/v2/main-page/indexing-status`
- `GET /api/v2/blocks/:block_number_or_hash`
- `GET /api/v2/transactions/:hash`
- `GET /api/v2/addresses/:hash`
- `GET /api/v2/tokens/:hash`
- `GET /api/v2/smart-contracts/verification/config`
