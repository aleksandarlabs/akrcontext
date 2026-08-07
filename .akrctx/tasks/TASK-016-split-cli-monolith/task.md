# Task

## Goal

`src/cli.ts` is 1661 lines: Commander wiring for ~20 commands, all user-facing help
text, option normalization, and action bodies in one file. Every command PR touches the
same file. Split it so `cli.ts` keeps only program assembly and each command (or command
family: `task`, `judge`, `impl`, `comprehension`, `templates`, `trace`) lives in its own
module under `src/cli/`, exporting a `register*(program)` function.

Behavior, help output, and option parsing must be byte-identical from the user's point
of view; this is a pure structural refactor.

## Validation

```
pnpm build && pnpm test && pnpm lint
node dist/index.js --help >/dev/null && node dist/index.js judge --help >/dev/null
```

## Out Of Scope

- Changing any help text, option names, defaults, or command behavior.
- Renaming or reorganizing the `run*` command modules (`src/init.ts`, `src/doctor.ts`,
  …) — they stay where they are; only the Commander wiring moves.
- Judge subsystem simplification (separate, postponed).

## Workflow

SDD — pure structural refactor with zero behavior change, so the spec is the existing observable CLI surface. Freeze it in characterization snapshots before moving code.

## Workflow Reason

No behavior change is permitted; the only correctness criterion is that help output, option parsing, and action wiring remain byte-identical. SDD lets us write the contract as snapshot tests first, then refactor safely against that contract.

## Clarifications

- None recorded yet.

## Open Questions

- None.
