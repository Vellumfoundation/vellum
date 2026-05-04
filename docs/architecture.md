# Architecture

```txt
Base
  -> Canonical rollup and bridge contracts
  -> Batcher and proposer postings
Vellum
  -> op-geth execution
  -> op-node rollup derivation
  -> sequencer
  -> public RPC gateway
  -> explorer and bridge indexer
  -> monitoring, backups, and runbooks
```

User-facing services are redundant where possible. Sequencing starts with one
active sequencer and a hot standby procedure; docs must not describe
decentralized sequencing unless it is actually implemented.
