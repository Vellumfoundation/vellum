# Monitoring

Monitoring uses Prometheus, Grafana, Alertmanager, and synthetic checks.

Synthetic checks are disabled for mainnet unless explicitly enabled with
environment variables. They must never spend meaningful mainnet funds by default.
