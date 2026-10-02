# Review Checklist

- [x] Capsule scope, criteria and plan corrected after the 2026-10-01 design review.

- [ ] Open questions resolved with the human and recorded under Clarifications.
- [ ] Manifest behaviour for template files verified, not assumed.
- [ ] Red tests written before implementation, including the preserve case.
- [ ] An edited template is never overwritten.
- [ ] Fresh install and eligible upgrade produce identical templates.
- [ ] Differing files without provenance are preserved and get candidates.
- [ ] Fresh installs record template hashes; dry-run leaves provenance unchanged.
- [ ] No hand-regenerated harness file in this delivery.
- [ ] Build, full tests, lint and required CLI checks run.
- [ ] Checklist completed before any snapshot capture, per TASK-051.
- [ ] Capsule ready for independent review; invocation requires user confirmation.
