# Acceptance Criteria

## The command surfaces are covered

Each bullet is at least one scenario. Each scenario runs the built CLI against a disposable
repository and asserts what a user would see or find on disk.

**Install and regenerate**

- AC-1: `init` on a clean repository produces the expected files, for each supported target.
- AC-2: `init` on a repository that already has `CLAUDE.md`, and again with `AGENTS.md`, **preserves the
  existing file** and writes the `.akrctx.suggested.md` counterpart. This is the most important
  behaviour akrctx has and it currently has no end-to-end coverage.
- AC-3: `init --dry-run` writes nothing. Asserted by comparing the fixture tree before and after.
- AC-4: `upgrade` regenerates managed files and leaves a user-edited unmanaged file untouched.

**Report**

- AC-5: `doctor` on an uninstalled repository, an installed one, and one missing some required files.
- AC-6: `doctor --json` produces the documented shape.
- AC-7: `doctor --ci` exits non-zero on a failing repository and zero on a healthy one.
- AC-8: `doctor --fix` writes only paths the write policy permits, and nothing else.

**Everything else**

- AC-9: `templates apply` and `templates apply --dry-run`.
- AC-10: `judge` snapshot capture, `verify`, `current`, plus at least one failure path of each.
- AC-11: `impl start`, `impl log`, `impl status`.
- AC-12: `compile`, `status`, `config set`, `remove`.

## The scenarios are honest

- AC-13: Every scenario runs twice on the same ref and agrees with itself.
- AC-14: No scenario depends on a timestamp, a host path, or a build-output hash.
- AC-15: Every scenario is proven to catch a real change: break the behaviour it claims to pin, confirm it
  fails, revert. Recorded per scenario in `log.md`, not once for the suite.
- AC-16: No scenario asserts only an exit code. An exit-code-only scenario passes through any behaviour
  change and is worse than none because it is trusted.

## Organisation

- AC-17: Scenarios are grouped into suites by command family. `pnpm eval -- --list` shows them grouped and
  readable.
- AC-18: `smoke` keeps its current meaning and its current members: the fast set that must always pass.
  Nothing is moved out of it.
- AC-19: Existing fixtures are reused. A new fixture is added only where no existing one fits, and its
  reason is recorded.

## No overlap with TASK-038

- AC-20: TASK-038 ships first. Where one of its `refactor` scenarios already covers a path, this task adds
  the paths around it rather than a second scenario for the same assertion.
- AC-21: `log.md` records which TASK-038 scenarios were extended and which paths were added, so a reviewer
  can see the boundary was respected.

## Nothing else moved

- AC-22: No change to `evals/lib/`, `evals/schema/`, `evals/cli.mjs`.
- AC-23: No change to `src/`. A scenario that reveals a bug produces a finding recorded in `log.md` and a
  new capsule, never a fix inside this task.
- AC-24: No existing scenario is modified.
- AC-25: `tests/evals.test.ts` passes; any addition to it is additive.

## Documentation

- AC-26: `evals/README.md` lists the suites and says what each covers.
- AC-27: `CHANGELOG.md` records the added coverage under the unreleased section, additive only,
  continuations indented two spaces.

## Validation

- AC-28: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-29: `pnpm lint` reports zero errors and zero warnings.
- AC-30: `pnpm eval` passes and its output is recorded in `log.md`.
- AC-31: `pnpm eval -- --list` output is recorded in `log.md`.
