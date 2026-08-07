# TASK-016 implementation log

## Done

1. Froze the observable CLI surface in characterization snapshots:
   - Added `captureHelp` helper to `tests/cli.test.ts` using `buildProgram()` with `exitOverride()` and `configureOutput()`.
   - Added snapshot tests for `akrctx --help` and one subcommand `--help` per command family (init, templates, doctor, status, config, task, compile, comprehension, impl, judge, trace, upgrade, remove).
   - Ran tests to write the baseline snapshots before moving code.

2. Split `src/cli.ts` into command-family modules under `src/cli/`:
   - `src/cli/shared.ts` — `addCommon`, `normalizeOptions`, `readStdin`, output helpers (`log`, `ln`), and all result printers (`printInit`, `printDoctor`, `printTemplateApply`, etc.).
   - `src/cli/init.ts`, `templates.ts`, `doctor.ts`, `status.ts`, `config.ts`, `task.ts`, `compile.ts`, `comprehension.ts`, `impl.ts`, `judge.ts`, `trace.ts`, `upgrade.ts`, `remove.ts` — each exports a `register*(program: Command)` function.
   - `src/cli.ts` now only constructs the program, attaches global help text, and calls the `register*` functions. It is 92 lines.

3. Validated zero behavior change:
   - `pnpm build && pnpm test && pnpm lint` all pass.
   - Snapshot tests pass unchanged.
   - `node dist/index.js --help` and `node dist/index.js judge --help` succeed.
   - `pnpm akrctx init --target codex --dry-run` and `pnpm akrctx doctor --json` behave as before.

## Verification

```
wc -l src/cli.ts src/cli/*.ts
# src/cli.ts         92
# src/cli/shared.ts 424
# ... command modules
```

No help text, option names, defaults, or action behavior were changed.
