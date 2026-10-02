# Review Checklist

- [x] Capsule scope, criteria and plan corrected after the 2026-10-01 design review.

- [x] Contract recorded in task.md before implementation, including the isolation limits.
- [x] Contract decisions closed on 2026-10-02 under the user's delegated authority.
- [ ] Red tests written before implementation for reproduction and the path-scope rule.
- [ ] Foreign-capsule rule still fail-closed outside the declared paths.
- [ ] Operator approval required on every path, including headless.
- [ ] Nothing writes to the live project or to the canonical snapshot.
- [x] Two-step provenance, rejection of candidate bootstrap and explicit capture authorization specified.
- [ ] TASK-075 replayed as an adapted two-step fixture; candidate idempotency is insufficient.
- [ ] Generator correctness and non-generated changes independently reviewed.
- [ ] Shipped harness files regenerated from src/templates, not hand-edited.
- [ ] Build, full tests, lint and required CLI checks run.
- [ ] Checklist completed before any snapshot capture, per TASK-051.
- [ ] Capsule ready for independent review; invocation requires user confirmation.
