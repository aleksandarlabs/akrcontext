# TASK-078 — A mechanical signal for the clarification step

## Goal

Add an experimental, non-blocking notice for an observable documentation gap: an existing
capsule's contract or criteria changed across a reviewed boundary without new recorded
clarification content or an explicit statement explaining why no clarification was needed.
The notice describes compared text and never claims to prove a skipped human consultation.

## Problem evidence

Clarification decisions are recorded as prose. Current verification reports unresolved open
questions, but cannot establish which contract decisions were discussed with the human.

TASK-075 is the motivating case. It carries two claims that must not be merged.

The event is recorded, outside the repository. In the session that produced TASK-075, the
implementing agent reported that it wrote five contract decisions without asking: the
`observations` element type, the status enum values, whether a capsule defect blocks every
verdict, the renumbering rule, and the replacement of a measurable criterion with a bookkeeping
one. The human did not dispute that account. The gap this task addresses is therefore real, and
its evidence lives in a session transcript that no repository tool can read.

The mechanical limit is a separate claim. Commit 93506b5 introduces that task.md carrying both
the Contract and a `### Session 2026-09-20` heading that records four earlier clarifications. The
diff cannot distinguish a consulted decision from later elaboration, and the absence of a second
session heading proves nothing by itself. This signal must treat the historical case as
inconclusive, and must never present a diff as proof that a human was not consulted.

## Contract

Confirmed by the human on 2026-10-03. See `## Clarifications`, Session 2026-10-03.

### Supported comparison and trigger

In verify, compare the reviewed base and candidate for changes to task.md's `## Contract`
section (including its subsections) or acceptance-criteria.md. Support snapshot and commit-ref
boundaries with readable base/candidate content. Never substitute the live workspace.
WORKTREE and missing/unreadable comparison inputs produce an explicit `comparison unavailable`
diagnostic, never a missing-consultation conclusion.

Limit the missing-clarification heuristic to existing capsules with Clarifications sections
on both sides. New capsules and capsules predating that section are explicitly not comparable.
TASK-075's first-added capsule stays inconclusive; the external session evidence in Problem
evidence is not mechanically recoverable from the diff.

Normalize CRLF/LF and whitespace reflow within prose paragraphs/list-item continuations.
Preserve block boundaries and order, fenced/inline code and structured metadata/declaration
lines such as proof-command:, proof-doc: and Retired:. For cosmetic punctuation, ignore only
a single terminal full stop on a prose paragraph/list item outside code. Do not strip other
punctuation: operators, paths, identifiers, numbers, quoting and Markdown syntax may be semantic.
Any remaining normalized change is eligible to trigger the heuristic.

### New clarification

A top-level `- ` bullet under Clarifications whose normalized full body was absent in the base
is new recorded clarification content. Include wrapped continuations, ignore placeholder None
variants, and do not count heading/date changes or duplicates of an existing bullet.
A new bullet starting `No ambiguity:` with a non-empty explanation is an explicit assertion
that no clarification was needed. An empty explanation does not suppress the signal.
New meaningful content suppresses the notice; a heading/date alone does not.

This checks recorded assertions, not authenticated human involvement. It cannot establish
whether a new bullet relates to every changed decision or whether a conversation occurred.

### Notice and detection limits

Without new clarification content, emit one bounded heuristic notice per changed compared
section/file. Include its name, added/deleted raw line counts and a pointer identifying the
reviewed base/candidate (snapshot ID where applicable) and relative path. Never embed the diff;
cap each notice at 1024 characters, abbreviating long display paths while retaining the boundary
ID and section. All diagnostics stay non-blocking and leave valid/approved unchanged.

Known false positives include a clearer paraphrase, grammar/punctuation edits outside the
narrow normalization rule, and contract reordering without a new decision. Known false
negatives include punctuation-only meaning changes covered by normalization, a clarification
bullet unrelated to the new decision, self-reported No ambiguity, and changes made before the
review base. Neither the notice nor its absence proves consultation occurred or was skipped.

AC-5 remains retired; AC-11 covers the inconclusive historical example. No Doctor heuristic
or minimum number of clarification questions is introduced.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope
- Blocking approval on this signal. A heuristic must not fail a review closed. It reports.
- Judging whether a recorded clarification is good, or whether a question was worth asking.
  Neither is mechanically decidable.
- Counting questions, or enforcing a minimum. The existing rule already rejects a budget.
- Changing the clarification rules themselves. Only detection is in scope.

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

### Session 2026-10-03
- Trigger normalization confirmed by the human as drafted. The comparison ignores only CRLF/LF,
  whitespace reflow within prose, and one terminal full stop on a prose paragraph or list item
  outside code. Operators, paths, identifiers, numbers, quoting, Markdown syntax, code and
  structured declaration lines stay significant.
- New clarification content confirmed by the human as drafted. A new top-level bullet under
  `## Clarifications`, with its continuations, counts when its normalized body was absent in the
  base. A new `No ambiguity:` bullet with a non-empty explanation asserts no question was needed.
  A heading or date alone, a duplicate bullet or a None placeholder does not count. One new
  bullet suppresses the notice for every changed section; this is an accepted false negative.
- Notice content confirmed by the human as drafted. One notice per changed section or file,
  naming it, with added and deleted line counts and a pointer to the reviewed boundary and
  relative path. Never the diff itself. Each notice is capped at 1024 characters; long paths are
  abbreviated, but the boundary ID and section are kept.
- Supported boundaries confirmed by the human as drafted. Snapshot and commit-ref candidates
  are compared. A `WORKTREE` candidate or unreadable inputs report `comparison unavailable`. A new
  capsule, or one without Clarifications on both sides, stays inconclusive with no notice. A
  bullet date is never evidence.
- During implementation the human decided four points the contract did not cover. The WORKTREE
  `comparison unavailable` diagnostic goes into `notices`; the human authorized minimal edits to
  the three existing tests that assert `notices` exactly or the word "unavailable". A compared
  file missing or unreadable on one side reports `comparison unavailable` for that file, and an
  absent `## Contract` section compares as empty text. Structured lines are only `proof-command:`,
  `proof-doc:` and `Retired:`. The `No ambiguity:` prefix ignores letter case.

## Open Questions

- None.
