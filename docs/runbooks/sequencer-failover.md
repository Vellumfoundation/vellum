# Sequencer Failover Runbook

1. Confirm alert and latest block timestamp.
2. Check public RPC read availability.
3. Stop the failed sequencer safely.
4. Verify standby sequencer state and head.
5. Promote standby sequencer.
6. Point batcher/proposer to promoted sequencer if required.
7. Verify block production.
8. Verify transaction inclusion.
9. Update status page.
10. Start incident timeline and postmortem.
