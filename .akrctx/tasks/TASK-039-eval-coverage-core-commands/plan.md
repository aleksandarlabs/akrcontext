# Plan

## Workflow

- EDD

## Why

Same reason as TASK-038: the deliverable is evidence machinery. There is no feature to specify and
no defect to reproduce. The work is choosing what a scenario should assert, then writing it so it
fails when the behaviour breaks.

`TDD` was rejected: the artifacts are tests already.

`fast-patch` was rejected. This is not a small change, and coverage that cannot fail is a liability
rather than an omission — six months from now someone will trust it.

`SDD` was rejected: nothing about the scenario schema or the report format changes.

The honest limit of this task: it adds no capability and fixes no bug. It converts a set of
untested claims into tested ones. Its value shows up entirely in changes that have not been made
yet.

## Steps

### Sequence

1. Confirm TASK-038 has landed. Its `refactor` scenarios cover `init`, `doctor`, `templates apply`
   and `judge` partially, and this task extends them rather than duplicating them.
2. Inventory what TASK-038 covers, in `log.md`, before writing anything. The overlap is where
   duplicate scenarios get written by accident.

### Answer the fixture question early

3. `judge` needs a snapshot, and snapshot capture reads Git state. Establish whether the current
   fixture machinery can produce a fixture that is a real Git repository with commits. If it
   cannot, stop and report it — a change to the fixture machinery is larger than this capsule
   should make on its own.

### Build, in order of value

4. Start with `init` into a repository that already has `CLAUDE.md`. It is the most important
   uncovered behaviour in the product and the one whose regression would be most expensive.
5. Then the rest of install and regenerate: clean init per target, `--dry-run` writing nothing,
   `upgrade` leaving user edits alone.
6. Then doctor: uninstalled, installed, partial, `--json`, `--ci` exit codes, `--fix` write policy.
7. Then the remainder: templates, judge, impl, compile, status, config, remove.
8. For **each** scenario: run it twice on the same ref, then break the behaviour it pins, confirm
   it fails, revert, record the transcript. A scenario that skips this step is decoration.

### Organise

9. Group into suites by command family. Leave `smoke` exactly as it is — same members, same
   meaning.
10. Reuse the six existing fixtures. Add one only where none fits, and record why.

### Close out

11. Update `evals/README.md` with the suite list.
12. `CHANGELOG.md`, additive only, continuations indented two spaces.
13. `pnpm lint && pnpm build && npx vitest run`, plus `pnpm eval` and `pnpm eval -- --list`, output
    recorded verbatim.

## Risks

- **Scenarios that cannot fail.** The dominant risk in any coverage task. Twenty green scenarios
  asserting exit code zero look like coverage and are not. Step 8 is not optional and applies per
  scenario.
- **Duplicating TASK-038.** Two scenarios asserting the same thing means one of them will drift and
  nobody will know which is authoritative. Step 2 prevents it.
- **Scope inflation.** The command list is long and every command has flags. A scenario per flag
  combination produces a suite too slow to run and too noisy to read. The criterion is paths a user
  takes, not coverage percentage.
- **The Git fixture question could block half the task.** If judge scenarios need a real Git
  repository and the fixtures cannot provide one, that half stops. Step 3 finds out on day one
  instead of on day four.
- **Finding real bugs.** Likely, given that these paths have no end-to-end coverage today. The
  temptation is to fix them while there. Every fix inside this task makes the coverage change
  unreviewable and mixes two different kinds of risk. Report and move on.
- **Slow suite, disabled suite.** If the full set takes long enough to be annoying, someone will
  stop running it. Keeping `smoke` fast and separate is what protects against that.
