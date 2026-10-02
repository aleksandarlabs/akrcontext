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

**Draft, not confirmed.** The decisions below come from the assistant's recommendations and a
reviewing agent's refinements. No human confirmed them. Each one is listed under
`## Open Questions` for confirmation. Implementation must not start until they move to
`## Clarifications` with the human's answer.

### Declaration syntax

Optional proof declarations are two-space-indented continuation lines on their own AC bullet:

```text
- AC-1: The requested behavior is implemented.
  proof-command: pnpm test
  proof-doc: docs/behavior.md
```

Use only proof-command: and proof-doc:, not an ambiguous generic proof: field or a separate
block. The parser must recognize these physical lines before joining ordinary prose
continuations. Multiple declarations are allowed, one reference per line; identical repeated
kind/reference pairs are deduplicated. Empty, orphaned, unsupported proof-prefixed declarations
are capsule defects with file/line diagnostics. Commands and paths are single-line values.

### Command references

A proof-command must exactly match a capsule-declared Validation command after the same
parsing/normalization already used by validation, including removal of its optional marker.
It adds no execution channel. Multiple command references are all necessary for that AC.
A command optional globally becomes necessary for a criterion that explicitly requires it.

An undeclared command or absent/failed/not-run evidence for a required proof command is
`proof requirement unmet` and prevents a claimed pass for that criterion. A recorded passing
status accepted on trust retains today's validity rules but emits `execution not observed:
command accepted on trust`. Only a successful observed re-run removes that notice; failure
produces the existing validation failure and an unmet-proof reason. No extra execution occurs.

For a criterion reported not-evaluated, name `criterion not evaluated` separately from proof
availability. These reasons may coexist; do not hide an unmet proof behind an evaluation label.
Keep current reasons/notices and the existing record shape, with no new status enum or field.
A passing proof never forces a semantic pass from the judge.

### Documentary references and compatibility

A proof-doc is a repository-relative file path, optionally followed by a Markdown heading
fragment. It only points the judge to reviewed content; unchanged boundary files may qualify.
Reject absolute paths, traversal and policy-blocked references without reading their targets.
A well-formed but missing document is reported as unavailable and remains a matter for the
judge's criterion assessment, not an automatic mechanical proof failure. Existence alone
never establishes semantic satisfaction. Never fetch remote content or follow escaping links.

Declarations remain optional; absence is not not-evaluated. Do not migrate historical capsule
prose. Preserve schema 6, criteria[] and observations[]. Individual test-name enforcement and
reporter-text matching remain out of scope. Honor TASK-084 retirement metadata as non-criteria.

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

### Session 2026-10-02
- The human reviewed the provenance of this capsule's contract and returned its decisions to
  `## Open Questions`. The contract had recorded them as the human's own, which was false: they
  came from the assistant's recommendations and a reviewing agent's refinements. One of three
  comparable recommendations was already reversed by the human in TASK-084 once its consequence
  was shown, so an unconfirmed recommendation is not treated as an answer.

## Open Questions

- Confirm the declaration syntax and its location. Draft: an indented declaration line on the
  criterion's own bullet, parsed before prose folding, spelled exclusively `proof-command:` or
  `proof-doc:`. The generic `proof:` spelling is discarded to avoid two competing formats, and
  repeated identical references are deduplicated.
- Confirm how the two reference kinds differ. Draft: only `proof-command:` carries mechanical
  effect; `proof-doc:` points at content to inspect and never becomes a gate; a malformed or
  policy-blocked reference is a capsule defect.
- Confirm how verify expresses proof availability. Draft: three distinct text reasons, for an
  unmet requirement, for unobserved execution where the command was taken on trust, and for a
  criterion the judge did not evaluate. The record shape stays unchanged.
