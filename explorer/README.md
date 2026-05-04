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

The root URL serves the Blockscout frontend. API requests under `/api` are
proxied to the Blockscout backend on the same host and port.

The Blockscout API is expected at:

- `GET /api/v2/main-page/indexing-status`
- `GET /api/v2/blocks/:block_number_or_hash`
- `GET /api/v2/transactions/:hash`
- `GET /api/v2/addresses/:hash`
- `GET /api/v2/tokens/:hash`
- `GET /api/v2/smart-contracts/verification/config`
