# Context

## Relevant Files

- `src/cli.ts` — the monolith. Command definitions at roughly: init L101, templates
  L135-209, doctor L210, status L247, config L283-314, task L315-420, compile L421,
  comprehension L451-513, impl L514-675, judge L676-770+, trace/hook wiring further down.
- `src/index.ts` — bin shim; imports `main` from `cli.ts`. Its contract must not change.
- `tests/cli.test.ts` — drives `main(argv)` end to end; the safety net for "help and
  parsing stay identical". Likely needs strengthening before the move (see plan).
- `src/format.ts` — shared output helpers the extracted modules will import.

## Prior Findings

- Architecture wiki already documents the layering as `cli.ts` = wiring; the file has
  outgrown "one module per verb" but the fix is mechanical: imports + `addCommon` helper
  move with each command family.
- Largest contiguous blocks: `impl` (~160 lines) and `judge` (~95 lines) families.

## Blocked Reads

- Secrets and credentials must not be read.
