# Database Restore Runbook

1. Identify database and backup timestamp.
2. Verify backup checksum.
3. Restore into staging first.
4. Run application health checks.
5. Confirm bridge indexer resumes without duplicate state.
6. Promote restored database only after owner approval.
7. Record restore duration and gaps.
