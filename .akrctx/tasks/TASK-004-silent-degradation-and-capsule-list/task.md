# TASK-004

## Goal

Close three live defects found while auditing akrctx for the "contract as mechanism"
plan. All three are cases where the harness proceeds on a weaker contract than the one
it declares, without saying so:

- **(a)** `readConfig` returns `undefined` for a corrupt `config.json`, so `runTask`
  falls through to `allowed = [...workflows]` and silently grants every workflow while
  losing `defaults.workflow`.
- **(b)** `normalizeConfig` invents `targets: ["codex"]` when the parsed config is not
  an object or declares no recognizable target.
- **(d)** Three lists of task-capsule files disagree. `_template` ships four,
  `runTask` writes five, `judge-enforcement` requires five and throws. `akrctx judge
  scope` therefore fails on a capsule copied from the shipped template.

## Recommended Workflow

TDD

## Workflow Notes

- Workflow source: `.akrctx/config.json` `workflowRules.bugfix` is `TDD`, and
  `defaults.workflow` is `task-fit`, so the rule applies.
- Why this workflow: all three defects are stated as exact predicates over observable
  behavior (what a corrupt config makes the CLI do, which files the judge requires), so
  each one can be written as a failing test first. There is no design uncertainty to
  resolve with research, and the change is not a contract change that needs SDD.
- Context loaded: `src/config.ts`, `src/task.ts`, `src/doctor.ts`, `src/judge.ts`,
  `src/compile.ts`, `src/status.ts`, `src/harness-files.ts`, `src/judge-enforcement.ts`,
  `src/templates/wiki.ts`, `src/templates/defaults.ts`, and the config-related tests.
  Not read: template packs, remove, comprehension, wiki-lint.

## Validation

Commands that prove this task works. The judge must run at least one of these to
approve, and `akrctx judge verify --run-tests` re-runs the ones the review claims
passed. Nothing outside this list is ever executed.

```
pnpm test
pnpm lint
```

## Out Of Scope

- The hook entry point, session identity, and the session trace. Those are the next
  task and depend on this one only for (d).
- Manifest drift verification in `doctor`. Agreed to add as a report, tracked separately.
- The four `enforcement.*` booleans that nothing reads. Making them real is phase 3.
- Any change to judge approval rules or the comprehension gate.

## Open Questions

- None. The three defects and their intended behavior were agreed before implementation.
