# Context

## Workflow selection

Config default is `task-fit`. This task is ~80% documentation (decision records + one config
doc clarification) and one small, well-understood DX code change with a test. Selected
**fast-patch**: the behavioural change is small, safe, and isolated to the existing-install
path of `init`; the rest is recorded design decisions, which need no TDD/SDD. The
behavioural change still gets a test (criterion under "init warns when a new target is
narrowed out").

## Relevant files

- `docs/CONFIGURATION.md` — `trigger` clarification (point 1).
- `src/types.ts` — `trigger` doc-comment (point 1).
- `src/init.ts` — narrowing warning (point 4); existing `mergeTargets` / `readExistingConfig`.
- `src/agents.ts` — `resolveAgents`, `agentWarnings` (reference for the warning shape).
- `.akrctx/wiki/decisions.md` — three new decision records (points 2, 3, 5).
- `tests/agents.test.ts` — "init target accumulation" block (point 4 test).
- `CHANGELOG.md` — one `### Changed` entry (point 4 only).

## Non-goals (restated)

No plugin API, no legacy migration, no trigger-semantics change, no model-pattern edit.