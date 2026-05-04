# Snapshot Restore Runbook

1. Download signed or checksum-published snapshot.
2. Verify checksum.
3. Stop node process.
4. Replace node data directory.
5. Start execution and rollup nodes.
6. Confirm chain ID and config hash.
7. Confirm sync catches up to public head.
