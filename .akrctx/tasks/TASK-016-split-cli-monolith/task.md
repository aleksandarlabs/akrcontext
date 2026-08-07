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

## Clarifications

- None recorded yet.

## Open Questions

- None.
