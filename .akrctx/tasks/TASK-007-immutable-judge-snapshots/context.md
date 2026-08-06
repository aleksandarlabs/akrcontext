# Context

## Relevant Files To Inspect

- `src/judge-enforcement.ts` — live scope creation, record verification, validation runs.
- `src/judge-snapshot.ts` — immutable capture, integrity, current-state, and catch-up.
- `src/cli.ts` — judge scope/verify/status command surfaces and human output.
- `src/templates/judge.ts` — cross-host independent judge instructions.
- `src/templates/judge-contract.ts` — persisted review contract and JSON schema.
- `src/manifest.ts` — hashing conventions reused for content-addressed metadata.
- `src/fs-utils.ts` — safe file writing helpers.
- `tests/akrctx.test.ts` and `tests/cli.test.ts` — unit and CLI contract coverage.
- `CHANGELOG.md`, `README.md`, `docs/JUDGE.md`, `docs/COMMANDS_AND_UX.md`, and
  `docs/CONFIGURATION.md` — public release and usage documentation.
- `.akrctx/wiki/architecture.md` and `.akrctx/wiki/decisions.md` — layering and prior
  trust/provenance decisions.

## Blocked Reads

- .env
- .env.*
- *.pem
- *.key
- *.p12
- *.pfx
- secrets/
- credentials/
- private/
