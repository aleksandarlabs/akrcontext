# Review Checklist

## Sequencing and boundary

- [ ] TASK-038 landed first.
- [ ] `log.md` inventories what TASK-038 already covers, written before any new scenario.
- [ ] No scenario duplicates a TASK-038 assertion. Where a path was already covered, this task
      extended it — failure cases, second target, already-installed repository.
- [ ] `log.md` records which TASK-038 scenarios were extended and which paths were added.

## The fixture question was answered on day one

- [ ] `log.md` records whether the fixture machinery can produce a real Git repository with
      commits.
- [ ] If it cannot, that was reported rather than improvised around, and the affected `judge`
      scenarios are explicitly deferred with a reason.

## Every scenario can actually fail

- [ ] For **each** scenario: the pinned behaviour was broken, the scenario failed, the change was
      reverted, and the transcript is in `log.md`.
- [ ] Each scenario ran twice on the same ref and agreed with itself.
- [ ] No scenario asserts only an exit code.
- [ ] No scenario depends on a timestamp, a host path, or a build-output hash.

## Coverage

- [ ] `init` clean, per supported target.
- [ ] `init` over an existing `CLAUDE.md`, and over an existing `AGENTS.md`: original preserved,
      `.akrctx.suggested.md` written. This is the most important box on this list.
- [ ] `init --dry-run` writes nothing, proven by comparing the fixture tree before and after.
- [ ] `upgrade` regenerates managed files and leaves a user-edited unmanaged file untouched.
- [ ] `doctor` uninstalled, installed, partially installed.
- [ ] `doctor --json` shape.
- [ ] `doctor --ci` exit codes both ways.
- [ ] `doctor --fix` writes only what the write policy allows.
- [ ] `templates apply` and `--dry-run`.
- [ ] `judge` snapshot, `verify`, `current`, plus a failure path of each.
- [ ] `impl start`, `impl log`, `impl status`.
- [ ] `compile`, `status`, `config set`, `remove`.

## Organisation

- [ ] Suites are grouped by command family and `--list` reads clearly.
- [ ] `smoke` has the same members and the same meaning as before. Nothing was moved out of it.
- [ ] Existing fixtures were reused; every new fixture has a recorded reason.

## Nothing else moved

- [ ] No change to `evals/lib/`, `evals/schema/` or `evals/cli.mjs`.
- [ ] No change to `src/`.
- [ ] Any bug found is recorded in `log.md` as a finding with a new capsule, and was **not** fixed
      here. Check this by reading the diff, not the summary.
- [ ] No existing scenario was modified.
- [ ] `tests/evals.test.ts` passes.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] `pnpm eval` passes, output in `log.md`.
- [ ] `pnpm eval -- --list` output in `log.md`.
- [ ] The full suite's wall-clock time is recorded. A suite slow enough to annoy people is a suite
      that stops being run.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
