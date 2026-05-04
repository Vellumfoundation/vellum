# Bridge

Bridge work is organized around standard OP Stack canonical bridge semantics and
Superbridge-compatible handoff metadata.

This folder must never contain fake production bridge behavior. During early
phases, zero addresses are allowed only in development placeholders and must
fail production validation.

## Layout

- `superbridge/`: machine-readable and human-readable integration package.
- `configs/`: environment-specific bridge config.
- `scripts/`: metadata generation, contract checks, and bridge flow tools.
- `tests/`: bridge and metadata tests.
- `indexer/`: bridge status indexer service.

The public testnet handoff package is generated under
`bridge/superbridge/testnet` by `pnpm testnet:import-artifacts` and validated
with `pnpm bridge:validate:testnet`.
