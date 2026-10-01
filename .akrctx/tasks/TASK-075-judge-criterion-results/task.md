# TASK-075 — Per-criterion judge results

## Goal
Reduce the number of review rounds per task. The judge reports a typed result for every
criterion in `acceptance-criteria.md` instead of a free-form `issues` list. A criterion is
the only thing that can block approval. Third delivery of the judge-latency plan: TASK-071
measured the pipeline, TASK-072 removed duplicated validation runs, this delivery attacks
round count.

## Problem evidence
Local judge records show repeated rounds against a growing boundary. TASK-006 ran four
rounds at 14, 18, 18 and 32 changed files. The `issues` entries of round 2 are new findings,
not the unresolved findings of round 1. TASK-005 ran four rounds and TASK-022 ran three.
TASK-073 and TASK-074 end in a declined judge review. Today `issues: string[]` has no upper
bound, so no round has a stable definition of done.

## Contract

### Criterion identifiers

Every top-level `- ` bullet in a capsule's `acceptance-criteria.md` is one criterion. The
bullet text starts with `AC-<n>: `, where `<n>` is a positive integer without padding.
Indented lines continue the bullet above them and carry no identifier of their own.

Identifiers are unique inside one capsule. A bullet with no identifier, a malformed
identifier, or a duplicate identifier is a capsule defect. Validation reports it and names
the offending file line. `akrctx task migrate-criteria [TASK-ID]` adds the identifiers to
existing capsules mechanically.

### Review record, schema 6

The record replaces `issues: string[]` with two arrays:

- `criteria[]` is the only blocking channel. One entry per declared `AC-<n>`, with
  `id`, `status` (`pass`, `fail` or `not-evaluated`) and a non-empty `evidence` string.
- `observations[]` is a string array for defects outside the declared criteria. It never
  blocks `APPROVED`.

The top level accepts exactly `schemaVersion`, `taskId`, `scope`, `verdict`, `tests`,
`criteria`, `observations`, `reviewedAt` and the optional `independent`. An `issues`
property makes the record invalid.

### APPROVED rule

`APPROVED` requires every entry in `criteria[]` to carry `status: "pass"`. The set of
reported identifiers must equal the set the capsule declares. A missing identifier and an
extra identifier both fail validation, and the error names each one. The existing validation
evidence rules are unchanged.

### Version transition

`JUDGE_SCHEMA_VERSION` is 6. The CLI emits only version 6. `akrctx judge verify` also reads
a stored version 5 record: it applies the version 5 shape and the version 5 APPROVED rules,
reports `legacy: true`, and prints a notice. The criteria rules do not apply to a legacy
record, because the capsule it reviewed declared no identifiers.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope
- Jev, TypeSafe AI, or any external model provider. akrctx stays a harness over the host
  agent and manages no API key.
- Typed decision records for workflow selection and for the comprehension gate. Both add
  ceremony without reducing rounds or cost. Considered and rejected on 2026-09-20.
- Parallel execution of runner and judge. Unchanged from TASK-072.
- Changing what a capsule declares under `## Validation`.

## Clarifications

Ambiguity resolved with the human before implementation. One answer per top-level `- ` bullet.

### Session 2026-09-20
- Do not integrate Jev or any external provider. The value of akrctx is that it runs over the
  host agent with no keys, no network and no account. Jev sells latency and unit cost, which
  are not the bottleneck here, and it cannot explain why a criterion failed. The structural
  idea is kept; the vendor is not.
- Do not add typed decision records for workflow selection or for the comprehension gate.
  Both decisions happen once per task, nobody reports them as a problem, and schemas there
  add ceremony without reducing rounds.
- Target the round count, not the cost per round. TASK-072 already reduced cost per round.
  The acceptance measure is rounds to APPROVED, compared against the historical records in
  `.akrctx/local/judge/`.

- Criteria carry an explicit identifier in `acceptance-criteria.md`. Each criterion bullet
  starts with `AC-<n>: `. The judge references that identifier, never a position. Positional
  indexes were rejected because a bullet inserted or reordered between round 1 and round 2
  would silently repoint an existing finding. Text hashes were rejected because fixing a
  typo in a criterion, the usual reaction to a rejection, would break the reference. The
  cost is accepted: the template changes and the 74 existing capsules need migration, which
  the CLI performs mechanically. Duplicate or missing identifiers must fail validation.

- `issues[]` is removed from the review record. A `criteria[]` array replaces it as the only
  blocking channel: one entry per `AC-<n>`, with a status and evidence. A separate
  `observations[]` array reports defects outside the declared criteria and never blocks
  APPROVED. Keeping a free-form blocking list, in any form, would leave the unbounded
  finding list that causes the extra rounds. Requiring every issue to cite a criterion was
  rejected because it gives the judge no way to report a real defect outside the criteria.
  The loss is accepted and mitigated: such a defect appears in `observations[]` and becomes
  a separate decision, not a blocker on the current round.

- `JUDGE_SCHEMA_VERSION` moves to 6 with bounded dual read. `akrctx judge verify` accepts a
  stored v5 record under the v5 rules, marks it legacy in its output, and never emits v5.
  This follows the precedent already in the contract README, where a capsule with no
  `## Validation` section verifies as legacy and reports `verifiedNow: unknown`. A clean cut
  was rejected because it breaks the TASK-072 transition criterion and invalidates every
  stored approval. A per-capsule gate was rejected because it keeps two live contracts with
  no end date. The cost is accepted: one legacy branch in `src/judge-enforcement.ts`.

## Open Questions

Ambiguity still unresolved. One question per top-level `- ` bullet.

- None recorded yet.
