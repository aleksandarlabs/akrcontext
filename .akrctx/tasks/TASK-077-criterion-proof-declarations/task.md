# TASK-077 — Declared proof per acceptance criterion

## Goal

Let each `AC-<n>` optionally declare expected evidence: a capsule-declared validation command
or a documentary reference in the reviewed boundary. Command evidence is a necessary condition
for approval, not a replacement for judging whether the criterion is actually satisfied.
Documentary references guide the judge to content; file presence alone proves no behavior.

## Problem evidence
TASK-075 made the judge report `evidence` for every criterion, but nothing says what evidence
counts. The round history motivates investigating evidence disagreements, but does not establish
that they caused the extra rounds:
TASK-050 and TASK-052 each took five rounds, TASK-005, TASK-006, TASK-047, TASK-048 and
TASK-058 took four. A judge that invents the standard each round, and an implementer that
guesses it, may contribute to that pattern; changing scope and code defects can also do so.

Capsule criteria today are prose. Several lack an explicit standard of evidence: TASK-071 carries
"Documentation explains collection, interpretation and unmeasured agent/user latency", and the
generated template ships "Relevant validation commands are documented or run". Both need a concrete interpretation that a documentation reviewer can assess.

## Contract

Scope constraints from the design review:

- Declarations remain optional. Existing capsules are not migrated and absence of a proof
  does not imply `not-evaluated`.
- Command references must name commands already declared under `## Validation`. A claimed
  passing result uses the current validation trust rules; only re-execution supplies observed
  execution evidence. This feature must not turn a claim into an observed result.
- An unmet declared command requirement prevents that criterion passing. A passing command
  does not force `pass`: the judge still checks the criterion and the relevance of its proof.
- Documentary references identify where to inspect evidence. Neither existence nor inclusion
  in changed files establishes that the criterion is met. Existing unchanged files within the
  boundary can be relevant evidence too.
- Individual test-name enforcement is deferred until a structured result format exists.
  Matching names in free-form reporter output is outside this delivery.
- `criteria[]`, `observations[]` and schema 6 remain unchanged. No new execution channel or
  mandatory fake proof is introduced for criteria requiring judgment.

Declaration syntax and the precise verification behavior remain open below.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Mandatory proof declarations or migration of existing capsule prose.
- Individual test-result ingestion or matching test names in reporter text.
- Treating file existence, changed-file membership or self-attestation as semantic proof.
- New executed commands, automatic proof generation or a review record schema change.

## Clarifications

Ambiguity resolved with the human before implementation. One answer per top-level `- ` bullet.

### Session 2026-10-01
- The user requested corrections to these capsules after the design review. This revision
  applies the scope and consistency corrections from that review; it does not implement the
  proposed CLI features. Unresolved contract choices remain under Open Questions.

## Open Questions

- Where does a declaration live: an indented field on its AC bullet or a separate evidence
  section keyed by AC identifier? Define syntax and malformed/duplicate-reference handling.
- How are command and documentary references represented without conflating mechanically
  checked command status with the judge's assessment of documentary content? Define handling
  of missing, unsupported and policy-blocked references.
- How does verify express proof availability when commands were only taken on trust? Define
  the distinction between an unmet requirement, unobserved execution and a criterion that
  the judge did not evaluate, while preserving the current record shape.
