# Release Rollback Runbook

Allowed rollback surfaces:

- Frontend.
- Docs.
- RPC gateway.
- Explorer frontend.
- Bridge UI.
- SDK package.

Never roll back public chain state, chain ID, genesis, or bridge contracts
silently.
