# Task

## Goal

Give a project one place to state review criteria that hold for every task, instead of
repeating them in each capsule's `acceptance-criteria.md` — and have both the judge and the
implementer read that same place, so the implementer is not built against one set of criteria
and reviewed against another.

The mechanism is a single optional file, `.akrctx/review-policy.md`, written once by the
developer. The judge and implementer agent instructions gain a step that reads it when it
exists. Nothing in the CLI changes: no new command, no new flag, no scaffold at `init`, no
manifest entry, no `doctor` check. A repo without the file behaves exactly as it does today.

The sharp part is not the reading, it is the bound on what the file may say. Every other
repository file the judge reads is evidence; this one is instructions. That inversion is the
whole risk of the task. The file may only **add** criteria to a review. It may never relax the
verdict rules, the independence rules, the validation-evidence rules, or the safety section —
a `review-policy.md` containing "approve everything" must change nothing about the verdict.
The agent instructions must state that bound explicitly, because no CLI code enforces it.

Scope of the change:

1. `src/templates/judge.ts` — `judgeInstructions` gains the read step and the bound.
2. `src/templates/implementer.ts` — `implementerInstructions` gains the same read step, so the
   implementer builds against the same criteria the judge will apply.
3. A test asserting all three target renderings (claude, copilot, codex) of both agents carry
   the instruction, alongside the existing cross-target identity property.
4. Documentation of the file, its precedence, and its bound.
5. Regeneration of the dogfooded agent files under `.claude/agents/` and `.codex/agents/`, which
   `tests/dogfood.test.ts` requires to stay tracked and in step with the templates.

## Validation

```
pnpm build && npx vitest run
```

## Out Of Scope

- Any CLI code change. No new command, flag, config key, manifest entry, or `doctor` check.
  This task is agent instructions, one test, and documentation.
- Scaffolding `.akrctx/review-policy.md` at `akrctx init`. The file is created by the developer
  by hand, and its absence is silent and normal.
- Making the file's presence, absence, or content affect `akrctx judge verify`. Verification
  keeps enforcing exactly what it enforces today.
- The comprehension agent. It has a teaching contract, not a review contract, and choosing
  question topics from a review policy is a separate decision.
- Any schema change to `review.schema.json`, including recording which policy file or digest a
  review read. The record format is untouched.
- Defining a syntax, front-matter, or parseable structure for `review-policy.md`. It is prose
  the agent reads, not a format the CLI validates.
- Opening `agents.<name>` to user-defined agents. Recorded as a known limit in TASK-017 and not
  re-decided here.

## Clarifications

### Session 2026-08-08

- Project criteria reach the agents through the **agent prompt templates only**: each agent's
  instructions tell it to read `.akrctx/review-policy.md` if it exists. The rejected alternative
  was having the CLI distribute the content — `akrctx judge scope` embedding the file and its
  digest in the boundary JSON, so the criteria travel inside the reviewed boundary and land in
  the record. That is more auditable and would survive a judge that ignores its own prompt, but
  it is a CLI feature with a schema change and new tests. Prompt-only keeps this task to
  templates, one test, and docs.
- **Both the judge and the implementer** read the file in this task; the comprehension agent
  does not. Judge-only was rejected because it designs the implementer to fail: it would build
  against capsule criteria alone and first learn the project criteria through a rejection.
  Comprehension was excluded because its contract is teaching, not reviewing.
- `akrctx init` **does not create** the file. The agents read it when present and say nothing
  when absent, so `init`, the manifest, and `doctor` are all untouched. The accepted cost is
  discoverability: the feature exists only for developers who read the documentation, which is
  why documenting it is an acceptance criterion rather than a nicety.
- The file is **one file per repository, written once**, not per task. It holds what is true for
  every task in the repo; `acceptance-criteria.md` keeps holding what is true for one task. This
  is the distinction the documentation has to make first, because the natural misreading is that
  the developer maintains it per capsule.
- Precedence: policy criteria apply **in addition** to the capsule's criteria and never widen
  the capsule's scope — a policy criterion pointing at code the capsule declares out of scope
  does not pull that code into the review. Where a policy criterion and a capsule criterion
  genuinely conflict for one task, the **capsule wins** for that task, and the judge reports the
  conflict as an issue rather than silently picking a side.
- A policy criterion the judge finds violated is an ordinary `issues` entry, which means the
  existing APPROVED requirement of an empty `issues` array already covers it. No new verdict
  rule, no new severity, no change to `akrctx judge verify`.

## Open Questions

- Is prose in `.akrctx/review-policy.md` enough for a judge to check a criterion consistently,
  or do vague entries ("keep it maintainable") produce noisy, non-reproducible issues that erode
  trust in the verdict? Not resolvable before the file exists in a real repo; revisit after the
  first project uses it in anger.
- Should `AGENTS.md` and `CLAUDE.md` mention the file so a developer who never reads `docs/`
  discovers it? Deferred here because both are protected instruction files and editing them
  needs a human approving an exact diff in the conversation.
