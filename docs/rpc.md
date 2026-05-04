# RPC

Public RPC:

- HTTP: `https://rpc.vellum.example`
- WebSocket: `wss://rpc.vellum.example/ws`

The public gateway must proxy to healthy upstream nodes, rate-limit abuse, block
admin/debug methods, expose health endpoints, and avoid logging sensitive
transaction payloads.

Internal debug/admin RPC must never be exposed publicly.
