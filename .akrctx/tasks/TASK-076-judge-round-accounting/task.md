# TASK-076 — Round accounting for judge reviews

## Goal

Make review rounds countable with a read-only `akrctx judge rounds [TASK-ID]` report.
Report review work per task, distinguishing ordinary reviews and catch-up reviews, and keep
completed-task statistics separate from tasks still awaiting approval. TASK-071 added phase
timings and TASK-075 added per-criterion results. TASK-072 proposes removing duplicated
validation runs but is not implemented in the current code.

## Problem evidence
The judge-latency work targets repeated review work. Nothing counts rounds. TASK-075 needed an
ad-hoc Python pass over `.akrctx/local/judge/` to establish a baseline of 2.23 mean rounds
across 31 tasks, and that number now lives only in a local implementation log.

The directory has no owner. CLAUDE.md instructs the primary agent to "save its exact JSON
record under `.akrctx/local/judge/`", so every record is hand-named. The result is more than
ten conventions in one directory:

- `TASK-049-review.json`, `TASK-006-review-2.json`, `TASK-020-review-01.json`
- `TASK-007-final-approved.json`, `TASK-050-review-final2-approved.json`
- `TASK-047-a328907c6fd343c8e431.json` (bare 20-character digest)
- `TASK-045-d7ed997c8f67bfdcb94c.review.json` (digest plus a second extension)
- `TASK-001-2026-07-22T191831Z.json`, `TASK-056-2026-08-28-needs-changes.json`
- `TASK-058-approved-raw.json` and `TASK-058-final-raw-v2.json` (duplicate copies of one review)
- `TASK-040/` and `TASK-071/` (directories), plus a `records/` subdirectory holding one record

Counting files overstates rounds when approval and `-raw` copies describe the same review.
A genuine catch-up review is additional work and must remain visible separately. TASK-075
deduplicated by `(reviewedAt, scope.scopeDigest)`, but that rule exists only inside a throwaway
script.

## Contract

Scope constraints from the design review:

- `rounds` only reads local evidence. `verify` gains no filing side effect and this delivery
  adds no canonical naming, record-writing or historical migration command.
- Duplicate copies count once; a genuinely separate judgment must not be silently merged.
- Catch-up reviews remain visible as review work, with a separate category. Historical
  records whose category cannot be established are labelled unknown, never guessed.
- Report tasks whose latest chronological verdict is APPROVED separately from tasks whose
  latest verdict is NEEDS CHANGES or BLOCKED. This is historical completion, not live approval
  currency. Contradictory latest records must be reported as ambiguous.
- Keep the 2.23 historical figure labelled with its original counting rule. Current aggregates
  are recalculated from local records and must not be presented as that frozen cohort.

The round identity, supported legacy shapes and JSON structure remain to be specified before
implementation. AC-5 is retired because canonical filing is outside this delivery; its
identifier must not be reused.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Changing what makes a round necessary or what makes an approval valid.
- Canonical naming or filing, and any write from `verify` or `rounds`.
- Moving, renaming or deleting historical records.
- Network calls, uploads, dashboards or tracked reports. Records remain local-only.

## Clarifications

Ambiguity resolved with the human before implementation. One answer per top-level `- ` bullet.

### Session 2026-10-01
- The user requested corrections to these capsules after the design review. This revision
  applies the scope and consistency corrections from that review; it does not implement the
  proposed CLI features. Unresolved contract choices remain under Open Questions.

## Open Questions

- What identifies a historical review round? `(reviewedAt, scopeDigest)` merges duplicate
  copies but can also merge two different judgments with identical timestamps and scope.
  Define how differing verdicts, criterion results and independence claims are handled, and
  what the reader reports when historical evidence cannot distinguish two invocations.
- Which legacy record shapes can be counted from their contents, and how should records with
  missing identity fields or ambiguous chronological order be reported?
- What is the JSON structure for per-task details, closed-task aggregates, open-task totals,
  unknown categories and skipped files? The human and JSON reports must expose the same facts.
