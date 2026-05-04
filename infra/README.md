# Infrastructure

Infrastructure targets:

- Terraform modules for cloud resources.
- Kubernetes manifests for user-facing services.
- Systemd units for node operators.
- Nginx configs for RPC, explorer, bridge, and docs.

Production deployments must include redundant public RPC gateways, multiple
upstream nodes, monitored databases, backups, restore tests, and status page
components.
