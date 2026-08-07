# Plan

## Workflow

SDD

No behavior change is permitted, so the spec is the current observable CLI surface.
Freeze it in tests first, then move code.

## Steps

1. Add characterization tests to `tests/cli.test.ts`: `--help` output (and one
   subcommand `--help` per family) asserted against snapshots captured from the current
   build.
2. Create `src/cli/` with one module per command family, each exporting
   `register<Family>(program: Command): void`; move the corresponding block verbatim,
   plus the imports and helpers only it uses.
3. Reduce `src/cli.ts` to: program construction, global help text, and the `register*`
   calls.
4. Run validation; snapshots must pass unchanged.
