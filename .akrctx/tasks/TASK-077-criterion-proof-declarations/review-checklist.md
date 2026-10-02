# Review Checklist

- [x] Capsule scope, criteria and plan corrected after the 2026-10-01 design review.

- [x] Proof syntax, proof kinds and binding rule recorded in task.md before implementation.
- [x] Contract decisions closed on 2026-10-02 under the user's delegated authority.
- [ ] Red tests written before implementation for the parser and each proof kind.
- [ ] A criterion without a declared proof remains assessable; old capsules untouched.
- [ ] No new execution channel introduced; only `## Validation` commands ever run.
- [ ] Shipped harness files regenerated from src/templates, not hand-edited.
- [ ] Suitable criteria exercise supported declarations; no artificial proof is required.
- [ ] Passing commands and existing files do not force a semantic pass.
- [ ] No per-test status is inferred from reporter text.
- [ ] Build, full tests, lint and required CLI checks run.
- [ ] Checklist completed before any snapshot capture, per TASK-051.
- [ ] Capsule ready for independent review; invocation requires user confirmation.
