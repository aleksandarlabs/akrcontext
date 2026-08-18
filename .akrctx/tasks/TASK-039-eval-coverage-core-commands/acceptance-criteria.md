# Acceptance Criteria

## The command surfaces are covered

Each bullet is at least one scenario. Each scenario runs the built CLI against a disposable
repository and asserts what a user would see or find on disk.

**Install and regenerate**

- `init` on a clean repository produces the expected files, for each supported target.
- `init` on a repository that already has `CLAUDE.md`, and again with `AGENTS.md`, **preserves the
  existing file** and writes the `.akrctx.suggested.md` counterpart. This is the most important
  behaviour akrctx has and it currently has no end-to-end coverage.
- `init --dry-run` writes nothing. Asserted by comparing the fixture tree before and after.
- `upgrade` regenerates managed files and leaves a user-edited unmanaged file untouched.

**Report**

- `doctor` on an uninstalled repository, an installed one, and one missing some required files.
- `doctor --json` produces the documented shape.
- `doctor --ci` exits non-zero on a failing repository and zero on a healthy one.
- `doctor --fix` writes only paths the write policy permits, and nothing else.

**Everything else**

- `templates apply` and `templates apply --dry-run`.
- `judge` snapshot capture, `verify`, `current`, plus at least one failure path of each.
- `impl start`, `impl log`, `impl status`.
- `compile`, `status`, `config set`, `remove`.

## The scenarios are honest

- Every scenario runs twice on the same ref and agrees with itself.
- No scenario depends on a timestamp, a host path, or a build-output hash.
- Every scenario is proven to catch a real change: break the behaviour it claims to pin, confirm it
  fails, revert. Recorded per scenario in `log.md`, not once for the suite.
- No scenario asserts only an exit code. An exit-code-only scenario passes through any behaviour
  change and is worse than none because it is trusted.

## Organisation

- Scenarios are grouped into suites by command family. `pnpm eval -- --list` shows them grouped and
  readable.
- `smoke` keeps its current meaning and its current members: the fast set that must always pass.
  Nothing is moved out of it.
- Existing fixtures are reused. A new fixture is added only where no existing one fits, and its
  reason is recorded.

## No overlap with TASK-038

- TASK-038 ships first. Where one of its `refactor` scenarios already covers a path, this task adds
  the paths around it rather than a second scenario for the same assertion.
- `log.md` records which TASK-038 scenarios were extended and which paths were added, so a reviewer
  can see the boundary was respected.

## Nothing else moved

- No change to `evals/lib/`, `evals/schema/`, `evals/cli.mjs`.
- No change to `src/`. A scenario that reveals a bug produces a finding recorded in `log.md` and a
  new capsule, never a fix inside this task.
- No existing scenario is modified.
- `tests/evals.test.ts` passes; any addition to it is additive.

## Documentation

- `evals/README.md` lists the suites and says what each covers.
- `CHANGELOG.md` records the added coverage under the unreleased section, additive only,
  continuations indented two spaces.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- `pnpm eval` passes and its output is recorded in `log.md`.
- `pnpm eval -- --list` output is recorded in `log.md`.
