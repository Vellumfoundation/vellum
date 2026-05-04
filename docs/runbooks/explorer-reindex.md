# Explorer Reindex Runbook

1. Confirm indexing lag and database health.
2. Pause non-critical explorer writes if needed.
3. Snapshot current explorer database.
4. Restart indexer from last safe checkpoint.
5. Reindex from genesis only if checkpoint replay fails.
6. Validate transaction, token, and contract pages.
7. Update status page.
