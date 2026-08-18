# Task

## Goal

Give the core CLI commands eval coverage. Today six of the nine scenarios test the hook trace, and
the commands akrctx exists to provide have none.

## The gap

Measured on this commit:

```
9 scenarios, all in one suite (smoke)
changeType: 6 observability, 2 fix, 1 feature
```

Six of the nine cover the hook trace. The remaining three cover capsule templates and an invalid
config.

No scenario exercises `init`, `doctor`, `upgrade`, `templates`, `judge`, `impl`, `compile`,
`status`, `remove` or `config`. Those are the product. Unit tests cover them from the inside;
nothing runs the built CLI end to end against a disposable repository and asserts what a user sees.

This matters more for akrctx than for most CLIs, because the whole value proposition is what gets
written into someone else's repository. A unit test proving `runInit` returns the right object does
not prove the files landed, with the right content, without clobbering something the user wrote.

## What this task delivers

Scenarios for the core command surfaces, organised into suites, covering the paths a user actually
takes and the paths where being wrong is expensive:

**Install and regenerate**
- `init` on a clean repository, per target
- `init` on a repository that already has `CLAUDE.md` or `AGENTS.md` — the preserve-and-suggest
  path, which is the single most important behaviour akrctx has
- `init --dry-run` writing nothing
- `upgrade` regenerating managed files while leaving user edits alone

**Report**
- `doctor` on uninstalled, installed, and partially installed repositories
- `doctor --json` shape
- `doctor --ci` exit codes
- `doctor --fix` writing only what the write policy allows

**Everything else**
- `templates apply`, including `--dry-run`
- `judge` snapshot capture, `verify`, `current`, and the failure paths
- `impl` start, log, status
- `compile`, `status`, `config set`, `remove`

## Relationship to TASK-038

TASK-038 adds `refactor` scenarios for the six surfaces its six capsules touch, and is blocking for
them. This task fills the rest of the surface and blocks nothing.

They overlap on `init`, `doctor`, `templates apply` and `judge`. TASK-038 ships first and this task
extends what it created rather than duplicating it. Where a TASK-038 scenario already covers a
path, this task adds the paths around it — the failure cases, the second target, the
already-installed repository.

## Validation

```
pnpm lint && pnpm build && npx vitest run
pnpm eval
pnpm eval -- --list
```

## Out Of Scope

- Any LLM grader. `evals/` stays deterministic and provider-free.
- Changing the runner, the schema, the report format, or the CLI's behaviour. A scenario that
  reveals a bug produces a finding and its own capsule.
- The `refactor` suite and the six capsules TASK-038 updates.
- Performance or budget scenarios.
- CI wiring. Whether these run on every pull request is a separate decision.

## Clarifications

### Session 2026-08-18

- This capsule is **not blocking**. It is real debt and it can wait behind the audit fixes; TASK-038
  cannot, because it protects work that is about to start.
- Scenarios are grouped into **suites by command family**, not left in one growing `smoke` bag.
  `smoke` keeps its current meaning: the fast set that must always pass.
- Coverage is judged by **paths a user takes**, not by a percentage. A scenario per flag combination
  is noise; a scenario for "init into a repository that already has instructions" is the product.
- Where a behaviour is already covered by a unit test, a scenario is still added if the property is
  about **what lands on disk or what the user sees**. Those are different claims and the unit test
  does not make them.

## Open Questions

- Should any of these run in CI on every pull request? They execute the built CLI against disposable
  repositories, so they are slower than the unit suite but still free and deterministic. The
  argument for is that install behaviour is exactly what a regression would break silently. The
  argument against is wall-clock time on every push. Not decided here because it is a repository
  workflow question.
- `judge` scenarios need a snapshot, and snapshot capture depends on Git state inside the fixture.
  Is that expressible with the current fixture machinery, or does it need a fixture that is a real
  Git repository with commits? If the latter, that may be a larger change than this capsule should
  make and should be reported rather than improvised.
