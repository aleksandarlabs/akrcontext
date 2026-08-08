# Task

## Goal

Make the judge emit a record that `akrctx judge verify` accepts on the first try, by showing it
the exact shape instead of a list of field names.

The defect is live and was hit during the TASK-020 review. `src/templates/judge.ts:69` closes the
instructions with:

> Finish with exactly one JSON object matching `.akrctx/judge/schemas/review.schema.json`:
> schemaVersion, taskId, the complete scope output, verdict (`APPROVED`, `NEEDS_CHANGES`, or
> `BLOCKED`), tests, non-personal issues, reviewedAt, and (when non-independent)
> `independent: false`.

That names the top-level keys and nothing else. It never states that `schemaVersion` must be `2`,
and it never names the keys inside a `tests` entry. The judge reviewing TASK-020 produced
`schemaVersion: 1` and used `notes` where the schema requires `evidence`, and `akrctx judge
verify` refused the record:

```
Judge verification: INVALID
  - schemaVersion must be 2.
  - tests contains an invalid entry.
```

The consequence is worse than an extra round. The judge is read-only by contract, so it cannot
save or correct its own record — a trusted caller does. When the record does not validate, the
path of least resistance for that caller is to hand-edit the reviewer's output until it passes,
which is exactly the tampering surface `.akrctx/judge/README.md` warns about when it calls a
verified record "tamper-evident bookkeeping, not an unforgeable signature". A judge that
routinely forces the caller to edit its record trains the habit that makes that bookkeeping
worthless. This happened in the TASK-020 review: the caller edited `schemaVersion` and renamed
`notes` to `evidence` to get a verifiable record.

The fix: replace the closing prose with a complete, minimal example record, whose
`schemaVersion` is interpolated from `JUDGE_SCHEMA_VERSION` rather than typed as a literal, and
which states that no other keys are accepted. Add a test that validates the embedded example
against the same validation `akrctx judge verify` runs, so the example cannot drift from the
contract it illustrates.

## Validation

```
pnpm lint && pnpm build && npx vitest run
```

`pnpm lint` leads deliberately. TASK-020 declared only build and tests, so its judge never ran
Biome and approved a test file that failed `biome check` on two errors — the developer found it
at integration time. The judge executes exactly the commands in this block and nothing else, and
`akrctx judge verify --run-tests` re-runs exactly these, so a gate absent here is a gate nobody
holds.

## Out Of Scope

- The comprehension agent. `src/templates/comprehension-agent.ts` has the same defect in a worse
  form — "artifacts suitable for validation against `.akrctx/comprehension/schemas/`" names no
  field at all, across three schemas. It is recorded as an Open Question here, not fixed:
  `comprehensionGate.enabled` is `false` in this repo and no failure has been observed.
- Changing the review schema itself: no field added, removed, renamed, or loosened, and
  `JUDGE_SCHEMA_VERSION` stays at 2.
- Making `validateRecord` in `src/judge-enforcement.ts` tolerant of `notes`, of an absent
  `schemaVersion`, or of any other near-miss shape. The schema stays the contract.
- Reconciling the two independent definitions of the record shape — the hand-written
  `validateRecord` and the generated `review.schema.json`. Noted in context as pre-existing debt.
- Any change to verdict rules, APPROVED requirements, independence rules, the snapshot flow, or
  `--run-tests` approval.
- Re-reviewing TASK-020. Separate work with its own boundary.

## Clarifications

### Session 2026-08-08

- The fix is a **complete minimal example record embedded in the instructions**, not a prose
  enumeration of field names and values. The rejected prose option ("schemaVersion exactly 2,
  tests entries carry command/status/evidence and no other keys") is a smaller diff but keeps
  asking the agent to build a shape by reading sentences, which is the failure mode being fixed.
  An example is copied, not inferred.
- `schemaVersion` in the example is **interpolated from `JUDGE_SCHEMA_VERSION`**, the same
  constant `src/templates/judge-contract.ts` uses to generate the schema. A literal `2` in the
  prompt would silently go stale the next time the constant changes, reintroducing this exact
  bug at the next version bump.
- Making `akrctx judge verify` tolerant instead — accepting `notes` as a synonym for `evidence`
  and defaulting an absent `schemaVersion` — was **rejected**. It would move the contract out of
  the schema and force every consumer of a record to handle more than one shape, to spare one
  sentence in a prompt.
- **Only the judge** is fixed in this task. The comprehension agent's identical defect is
  deliberately left, because the gate is disabled here and nothing has failed because of it;
  fixing it means covering three more schemas and would triple the task.
- `pnpm lint` joins the `## Validation` block, ahead of build and tests. TASK-020 omitted it and
  its judge consequently approved a test file that failed `biome check`; the developer hit it
  during integration. A clean lint run means zero warnings as well as zero errors, and reaching
  it by disabling or downgrading a Biome rule does not count.

## Open Questions

- `src/templates/comprehension-agent.ts` tells the evaluator to produce artifacts "suitable for
  validation against `.akrctx/comprehension/schemas/`" without naming a single field across
  three schemas. Is that the same latent bug, invisible only because `comprehensionGate.enabled`
  is `false`, and should it get the same treatment before the gate is ever switched on?
- The record shape is defined twice and independently — by `validateRecord` in
  `src/judge-enforcement.ts` and by the generated `review.schema.json`. This task adds a third
  place that must agree, the example. Should the example be generated from the schema instead of
  written by hand, so agreement is structural rather than test-enforced?
