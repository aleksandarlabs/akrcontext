# Implementation Log

## Session 2026-08-25

### Root cause

Not a generation fault. Claude Code watches `.claude/agents/` for live changes,
but it does not watch a directory that did not exist when the session started
(https://code.claude.com/docs/en/sub-agents). On a first install, `enable`
creates that directory, so its agent stays unspawnable until a restart.

Evidence:

1. The consumer repository was a fresh install. TASK-020 got `Agent type
   'akrctx-implementer' not found`.
2. This repository already had `.claude/agents/` at session start. Both
   `akrctx-implementer` and `akrctx-judge` are spawnable in this session.
3. The docs confirm `name` and `description` are the only required frontmatter
   fields. `tools`, `model`, and `permissionMode` are optional and correct in
   the generated files.

### Change

- `src/agents.ts` — new `agentDiscoveryNotice(cwd, name, targets)`. It returns a
  notice only when the `claude` agent directory is absent. Callers must call it
  before the writes.
- `src/impl.ts`, `src/judge.ts`, `src/comprehension.ts` — each `enable` reads the
  notice before its write loop and returns it as `discoveryNotice`.
- `src/cli/shared.ts` — new `printAgentDiscoveryNotice`.
- `src/cli/impl.ts`, `src/cli/judge.ts`, `src/cli/comprehension.ts` — print it.
  The `--json` path already carries the field through the result object.
- `README.md` — new section "Agent Discovery in Claude Code".
- `CHANGELOG.md` — entry under Unreleased.
- `tests/agents.test.ts` — new describe block, three cases.

### Validation

- `npx vitest run` — 763 passed, 8 files.
- `npx biome check src/ tests/` — clean.
- `npx tsc --noEmit` — no errors under `src/`. The pre-existing errors under
  `tests/` are untouched by this change.

### Known gap, not implemented

`akrctx upgrade` regenerates agent files and can also re-create a deleted
`.claude/agents/` directory. It does not print the notice. The acceptance
criteria name `enable` only, so this stays out. Raise it as its own task if it
matters.

## Session 2026-08-25 — round 2, after judge review

Judge verdict on `SNAPSHOT:5bdf4244bf0da670373a` was NEEDS_CHANGES, with two
issues. Both were correct. Record:
`.akrctx/local/judge/TASK-040/review.json`.

### Issue 1 — the declared validation command does not exist

`akrctx impl enable` has no `--target` option, so the capsule's `## Validation`
block declared a command that exits 1. It was wrong before this task started.
Replaced with two commands that do run:

```
npx vitest run tests/agents.test.ts
npx biome check src/ tests/
```

### Issue 2 — the notice fired on a dry run

Real defect in round 1. `enable --dry-run` printed "not spawnable until you
restart" although the dry run wrote nothing and the directory still did not
exist. The claim was false, and a restart would have changed nothing.

Fixed in `agentDiscoveryNotice` rather than at the three call sites, so a
future caller cannot forget the rule. The helper now takes `{ dryRun }` and
returns undefined for a dry run. The three `enable` functions pass
`options.dryRun` through.

New test: "stays silent on a dry run, which creates no directory to be
undiscovered". It also asserts the following real run still reports the notice,
so the dry run loses no information.

### Validation

- `npx vitest run` — 764 passed, 8 files.
- `npx biome check src/ tests/` — clean.
- `npx tsc --noEmit` — no errors under `src/`.
