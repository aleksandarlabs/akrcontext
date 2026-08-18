# Task

## Goal

Make "behaviour is unchanged" a measured claim instead of a manual one, by adding `refactor`
scenarios to `evals/` and using `pnpm eval:compare` as the preservation gate for refactor work.

## The gap

Six capsules in the current backlog are refactors whose central acceptance criterion is that
nothing observable changes:

| Capsule | Surface that must not move |
|---|---|
| TASK-026 | doctor gap messages, every command that reads config |
| TASK-027 | hook trace report |
| TASK-029 | judge snapshot exclusion, hook blocked-path flags |
| TASK-033 | content `init` and `upgrade` generate |
| TASK-034 | `init`, `doctor`, `doctor --json`, `doctor --ci`, `templates apply` output |
| TASK-035 | eight `judge` subcommands, human and `--json` |

All six currently prove that claim by hand: capture the output before, capture it after, diff the
captures, paste the result into `log.md`. That is a real check, and it is also a check that depends
on the implementer remembering to take the first capture before the first edit — after which it
cannot be taken at all.

Meanwhile the repository already owns the tool for exactly this. `evals/` compares two committed
refs and reports mechanism and outcome separately. `scenario.schema.json` already accepts
`changeType: "refactor"`, `outcome.direction: "preserve"` and `outcome.verdict: "preserved"`.
`pnpm eval:compare -- --base origin/main --candidate HEAD` already exists.

Nothing uses it. All nine scenarios today are in one suite, `smoke`, and their change types are six
`observability`, two `fix` and one `feature`. Zero `refactor`.

So the backlog asks six implementers to reinvent by hand a check the project already automates.

## What this task delivers

1. A `refactor` suite under `evals/scenarios/`, with scenarios covering the six surfaces above.
2. The preservation gate as a documented, named command that a refactor capsule can cite.
3. The six capsules' acceptance criteria updated to cite the gate instead of describing a manual
   capture procedure.

## Why this is worth doing before the refactors, not after

After the refactors land, the base ref no longer contains the old behaviour to compare against —
it contains the refactored behaviour, and the scenarios would pin whatever the refactor produced.
A preservation gate built after the change measures nothing.

## Validation

```
pnpm lint && pnpm build && npx vitest run
pnpm eval -- --suite refactor
pnpm eval:compare -- --base origin/main --candidate HEAD --suite refactor
```

The second command must report every new scenario as `preserved` against an unchanged tree. A
scenario that cannot report `preserved` when nothing changed is broken, not strict.

## Out Of Scope

- Coverage for commands the six refactors do not touch. TASK-039 owns that.
- Any LLM grader. `evals/` stays deterministic and provider-free.
- Changing the runner, the schema, the report format, or the fixtures machinery. If a scenario
  cannot be expressed in the current schema, that is a finding to report, not a licence to extend
  the schema inside this task.
- Changing any behaviour the scenarios pin. If a scenario fails on an unchanged tree, the finding
  is recorded and the scenario is corrected; the product is not adjusted to fit it.
- Making the gate mandatory in CI. `eval:compare` needs two committed refs, which is a workflow
  decision, not a scenario decision.

## Clarifications

### Session 2026-08-18

- This capsule is **blocking** for TASK-026, 027, 029, 033, 034 and 035. It ships before them.
- The gate **replaces** the manual capture procedure in those six capsules; it does not sit beside
  it. Two overlapping checks where one is automated means the manual one stops being done and
  nobody notices.
- Scenarios pin **observable output**, not internal structure. A refactor is free to reshape
  anything the CLI does not print.
- `--json` output is pinned as **bytes**, not as a parsed object, wherever the schema allows.
  Indentation and key order are part of what consumers of `judge --json` depend on.
- The six capsules' `acceptance-criteria.md` files are edited by this task. That is unusual —
  a capsule normally does not touch another — and it is the point: leaving six manual procedures in
  place after automating them is how the automation gets ignored.

## Open Questions

- Should the gate become a required step in the review checklist template at
  `.akrctx/tasks/_template/review-checklist.md`, so every future refactor inherits it? It would
  make this permanent rather than a one-off for six capsules. It is not decided here because the
  template applies to every task type, and most tasks are not refactors.
- `eval:compare` needs a committed base ref. During implementation the candidate is usually
  uncommitted. Does the gate run against a work-in-progress commit, or does the workflow change so
  refactors are compared just before integration? This decides where in the capsule lifecycle the
  gate sits, and it is a workflow question rather than a technical one.
