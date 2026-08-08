# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled (no allowlist/denylist; no SO sandbox; no schema bump).
- [x] Tests or validation commands are defined (the TDD cases + `pnpm build && npx vitest run`).
- [x] Existing instructions were not overwritten. `src/templates/instructions.ts` and
      `src/templates/judge-contract.ts` were edited at source; the installed `CLAUDE.md` and
      `AGENTS.md` are **not** regenerated yet — that needs `akrctx upgrade` and explicit human
      approval, since they are protected instruction files.
- [x] Approval gate refuses — not silently approves — on a false/absent `approve` callback, on TTY
      denial, and on headless absence/mismatch of `--approve-commands`.
- [x] `verifyJudgeRecord` contains no `process.stdin` access and no terminal output.
- [x] `--approve-commands` is repeatable; a declared command containing a comma is approvable.
- [x] `--run-tests` refuses non-snapshot candidates; no code path executes in the live tree.
- [x] Verification without `--run-tests` still works on non-snapshot records.
- [x] `--approve-commands` is ignored when `--run-tests` is unset.
- [x] CHANGELOG records both breaking behaviors.
- [x] No installed harness copy hand-edited.

## Notes

- `captureJudgeCatchUpSnapshot` was an undeclared second caller of `verifyJudgeRecord({ runTests:
  true })`. It now takes the same `approve` callback and `judge snapshot --from-review` exposes
  `--approve-commands`, so catch-up cannot bypass the gate.
- The retired test (`--run-tests rejects a command that passes but moves the boundary it
  approved`) asserted the live-tree drift message, unreachable now that re-execution is
  snapshot-only. `boundaryDrift` became dead code and was removed with it.

## Validation run (2026-08-08)

- `pnpm test` — 719 passed, 7 files.
- `pnpm lint` — clean.
- `pnpm build` — success.
- `npx tsc --noEmit` — 30 pre-existing errors in `tests/akrctx.test.ts` (CompileResult union) and
  `tests/evals.test.ts` (untyped `.mjs` imports); none in the files this task changed.
- `akrctx doctor` — 100/100.
