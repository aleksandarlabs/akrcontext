# Review Checklist

- [x] Capsule scope, criteria and plan corrected after the 2026-10-01 design review.

- [x] Contract recorded in task.md before implementation, including the isolation limits.
- [x] Contract decisions confirmed by the human on 2026-10-03. The 2026-10-02 decisions had returned to Open Questions, so they were not closed on that date.
- [ ] Red tests written before implementation for reproduction and the path-scope rule.
  Not done: the tests were written after the implementation. The human accepted this deviation
  on 2026-10-03. See .akrctx/local/impl/TASK-080/log.md.
- [x] Foreign-capsule rule still fail-closed outside the declared paths.
- [x] Operator approval required on every path, including headless.
- [x] Nothing writes to the live project or to the canonical snapshot.
- [x] Two-step provenance, rejection of candidate bootstrap and explicit capture authorization specified.
- [x] TASK-075 replayed as an adapted two-step fixture; candidate idempotency is insufficient.
- [ ] Generator correctness and non-generated changes independently reviewed.
  Pending: round 1 returned NEEDS_CHANGES (AC-10 and one CLI defect). Round 2 needs a new snapshot.
- [x] Shipped harness files regenerated from src/templates, not hand-edited.
- [x] Build, full tests, lint and required CLI checks run.
- [x] Checklist completed before any snapshot capture, per TASK-051.
- [x] Capsule ready for independent review; invocation requires user confirmation.
