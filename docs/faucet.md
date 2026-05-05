# Faucet

The faucet is testnet-only by default. It serves a small HTTP UI and JSON API
for dispensing Vellum testnet ETH.

The service refuses to run against a mainnet chain config and does not send
transactions unless it is explicitly enabled.

## Run Locally Against Testnet

```bash
export FAUCET_RPC_URL=http://104.219.250.77:8545
export TESTNET_FAUCET_PRIVATE_KEY=0x...
export TESTNET_FAUCET_ENABLED=true
pnpm faucet:start
```

Open:

```text
http://104.219.250.77:8788
```

Health and status endpoints:

```bash
curl http://127.0.0.1:8788/healthz
curl http://127.0.0.1:8788/api/status
```

Request funds:

```bash
curl -X POST http://127.0.0.1:8788/api/request \
  -H "Content-Type: application/json" \
  --data '{"address":"0x000000000000000000000000000000000000bEEF"}'
```

## Controls

| Variable | Default | Purpose |
|---|---:|---|
| `TESTNET_FAUCET_ENABLED` | `false` | Required before the faucet sends ETH |
| `FAUCET_AMOUNT_ETH` | `0.01` | ETH sent per request |
| `FAUCET_WALLET_COOLDOWN_SECONDS` | `86400` | Per-wallet cooldown |
| `FAUCET_IP_COOLDOWN_SECONDS` | `3600` | Per-IP cooldown |
| `FAUCET_DAILY_BUDGET_ETH` | `1` | In-memory daily spend cap |
| `FAUCET_CORS_ORIGIN` | `*` | CORS origin for API requests |

## Operations

Fund the faucet wallet with Vellum testnet ETH before enabling public access.
The faucet sends native ETH on Vellum, not a custom gas token.

Current public testnet faucet settings:

| Field | Value |
|---|---|
| URL | `http://104.219.250.77:8788` |
| Amount per request | `0.001 ETH` |
| Daily budget | `0.01 ETH` |
| Wallet cooldown | `86400 seconds` |
| IP cooldown | `3600 seconds` |

Systemd and nginx templates are provided for server deployment:

```text
infra/systemd/faucet.service
infra/nginx/faucet.vellum.example.conf
```

For a single instance, the in-memory rate limits are enough for the first
public testnet window. For multiple instances, move request counters and daily
budget tracking to Redis before putting the service behind a load balancer.

Production faucet deployment is blocked unless explicitly approved.
