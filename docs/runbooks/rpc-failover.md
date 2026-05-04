# RPC Failover Runbook

1. Identify unhealthy gateway or upstream.
2. Confirm load balancer health checks.
3. Remove stale or lagging upstream.
4. Verify `/ready` on remaining gateways.
5. Confirm wallet-compatible methods still work.
6. Watch p95 latency and error rate.
7. Restore failed node from snapshot if needed.
8. Document incident timeline.
