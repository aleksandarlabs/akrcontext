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

**Draft, not confirmed.** The decisions below come from the assistant's recommendations and a
reviewing agent's refinements. No human confirmed them. Each one is listed under
`## Open Questions` for confirmation. Implementation must not start until they move to
`## Clarifications` with the human's answer.

The command is read-only. It neither files records nor changes verify, approval validity,
local-only storage, filenames or the live workspace.

### Record discovery and eligibility

Read regular local record files under .akrctx/local/judge, including task subdirectories and
records/, irrespective of filename or extension. Do not traverse snapshots/ or follow
symlinks, and honor blocked-read policy. Snapshot metadata may be read through existing
policy-aware helpers solely to classify the referenced boundary.

A parseable record needs a valid taskId, verdict (APPROVED, NEEDS CHANGES or BLOCKED) and
parseable reviewedAt. Malformed files or missing/invalid required fields go to skipped with
file and reason. In particular, missing reviewedAt is skipped, not chronologically guessed.
Older schema versions may qualify without passing today's full record verification.

A recognizable record lacking a valid scope.scopeDigest goes to unknown with its taskId,
files and reason and is excluded from round counts: it has no stable deduplication key.
Missing/invalid optional evidence is reported as unknown, not inferred from filenames.

### Round identity and classification

Within each task, one historical round is `(reviewedAt, scopeDigest)`. Compare reviewedAt as
its parsed UTC instant so equivalent timestamp offsets do not create extra rounds. Exact
copies count once and list all source files. This is an accounting convention; two genuinely
separate invocations with identical evidence cannot be recovered from those fields alone.

If records with one key disagree on verdict, independence (true, false or absent/unknown),
or supplied per-criterion statuses, count one round, mark it ambiguous, and list every source
file in unknown with a conflict reason. Do not silently select a preferred copy. Evidence
wording differences alone do not create a new round or a conflict.

Sort rounds by UTC instant, using scopeDigest as a stable display tie-breaker. Conflicting
verdicts at the latest instant or an ambiguous latest round make the task state unknown.
Otherwise the latest APPROVED means closed; latest NEEDS CHANGES or BLOCKED means open.
Recognizable uncountable records make the task state unknown because they can hide rounds.
These are historical states, never assertions that an approval matches the live workspace.

Categorize rounds as ordinary, catch-up or unknown using explicit boundary metadata only.
Catch-ups count as real review work. Missing category evidence does not discard an otherwise
countable round; report the uncertainty in unknown.

### Output

JSON has exactly these top-level fields:

- tasks[]: taskId, state (closed/open/unknown), and rounds[]. Each round carries reviewedAt,
  scopeDigest, verdict (null when conflicting), independent (true/false/null), category,
  ambiguous, and sorted source files[].
- closed{} and open{}: taskCount, roundCount, mean and max for tasks in that state. Empty
  groups have counts 0 and mean/max null, never a fabricated zero-round observation.
- unknown[]: entries with taskId (or null), sorted files[] and reason for uncountable records,
  conflicting evidence, uncertain task state or unknown round category.
- skipped[]: entries with file and reason for unreadable/non-record/ineligible inputs.

Sort tasks by taskId and diagnostics by file/reason. The optional task filter applies before
aggregation. Unattributable skipped files remain visible, labelled as such. Human output
renders every field and entry, including empty collections, using these same values.

Keep the 2.23/31-task historical baseline and its original counting rule in the implementation
log when comparing cohorts; do not hardcode this repository's baseline into a generic CLI.
AC-5 remains retired because canonical filing is outside this delivery.

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

### Session 2026-10-02
- The human reviewed the provenance of this capsule's contract and returned its decisions to
  `## Open Questions`. The contract had recorded them as the human's own, which was false: they
  came from the assistant's recommendations and a reviewing agent's refinements. One of three
  comparable recommendations was already reversed by the human in TASK-084 once its consequence
  was shown, so an unconfirmed recommendation is not treated as an answer.

## Open Questions

- Confirm the round identity. Draft: `(reviewedAt, scopeDigest)`, with UTC instants defining
  timestamp equality. Duplicate copies count once. When two records share that key but differ in
  verdict, criterion statuses or independence claim, the key is ambiguous: it counts as one round
  and the report names the source files.
- Confirm the handling of incomplete records. Draft: a record with a missing or invalid
  `reviewedAt` is skipped with a reason; a recognizable record missing `scopeDigest` is reported
  as unknown and not counted as a round; an unknown review category alone does not prevent
  counting a round whose key is complete. The reviewing agent found that the assistant's
  recommendations contradicted each other here, so this one needs a real answer.
- Confirm the JSON structure. Draft: `tasks[]`, `closed{}`, `open{}`, `unknown[]`, `skipped[]`,
  with null means and maxima for an empty aggregate. The human report prints the same fields.
