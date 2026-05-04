# Monitoring

Monitoring must cover:

- L3 block height and block time.
- Sequencer health.
- Batcher and proposer lag.
- Parent chain posting.
- RPC latency and error rate.
- WebSocket connections.
- Explorer indexing lag.
- Bridge deposits and withdrawals.
- Database health.
- Synthetic transfer and contract deployment checks.

## Public Status Service

The status service checks the live Vellum testnet RPC, explorer, bridge UI,
faucet, and docs endpoints.

```bash
export STATUS_RPC_URL=http://104.219.250.77:8545
export STATUS_EXPLORER_URL=https://explorer.vellum.example
export STATUS_BRIDGE_URL=https://bridge.vellum.example
export STATUS_FAUCET_URL=https://faucet.vellum.example
export STATUS_DOCS_URL=https://docs.vellum.example
pnpm status:start
```

Endpoints:

```text
GET /
GET /healthz
GET /api/status
```

The status page reports `operational`, `degraded`, or `unavailable`. Missing
optional public service URLs are reported as degraded until the corresponding
service is live.

Systemd and nginx templates are provided for server deployment:

```text
infra/systemd/status.service
infra/nginx/status.vellum.example.conf
```
