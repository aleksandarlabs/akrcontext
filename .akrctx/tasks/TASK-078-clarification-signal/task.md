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

Scope constraints from the design review:

- Detection belongs in verify, which has a reviewed boundary. Doctor has no equivalent base.
- Compare the reviewed base and candidate, not the current live workspace or agent-written dates.
- Limit the first delivery to existing capsules with comparable clarification sections.
  Newly introduced capsules, absent historical sections and unavailable baselines do not
  provide evidence of a missing consultation and must not emit that accusation.
- No notice changes `valid` or `approved`. State that the signal is heuristic and identify
  the changed section or file and the comparison used.
- The detector checks recorded text, not whether a conversation occurred or whether a question
  was necessary. New clarification content or an explicit no-ambiguity explanation is a
  self-reported statement, not authenticated human approval.
- A mechanical comparison cannot generally distinguish a prose edit from a contract change.
  The contract must list specific ignored transformations and known false positives instead
  of promising universal semantic classification.

AC-5 is retired: the historical TASK-075 diff cannot prove missing consultation. Its
identifier is not reused; AC-11 covers that inconclusive example.

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

## Open Questions

- Which exact text comparison triggers the notice, and which syntactic transformations are
  ignored? Specify supported examples and acknowledged false positives and false negatives.
- Which additions to Clarifications count as new recorded content, and what syntax expresses
  a no-ambiguity explanation? Neither form can authenticate a human consultation.
- How does the notice identify the changed contract/criteria without printing an unbounded
  diff? Choose a bounded summary or pointers to the reviewed diff.
- Which review-boundary types provide comparable base/candidate capsule content, and what
  explicit diagnostic is returned when that comparison is unavailable?
