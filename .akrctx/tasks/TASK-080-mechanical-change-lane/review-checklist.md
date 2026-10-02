# Review Checklist

- [x] Capsule scope, criteria and plan corrected after the 2026-10-01 design review.

- [ ] Contract recorded in task.md before implementation, including the isolation limits.
- [ ] Open questions resolved with the human and recorded under Clarifications.
- [ ] Red tests written before implementation for reproduction and the path-scope rule.
- [ ] Foreign-capsule rule still fail-closed outside the declared paths.
- [ ] Operator approval required on every path, including headless.
- [ ] Nothing writes to the live project or to the canonical snapshot.
- [ ] Generator provenance, absent-base bootstrap and capture authorization specified.
- [ ] TASK-075 replayed with explicit tool provenance; candidate idempotency is insufficient.
- [ ] Generator correctness and non-generated changes independently reviewed.
- [ ] Shipped harness files regenerated from src/templates, not hand-edited.
- [ ] Build, full tests, lint and required CLI checks run.
- [ ] Checklist completed before any snapshot capture, per TASK-051.
- [ ] Capsule ready for independent review; invocation requires user confirmation.
