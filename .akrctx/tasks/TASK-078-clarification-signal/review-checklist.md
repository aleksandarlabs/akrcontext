# Review Checklist

- [x] Capsule scope, criteria and plan corrected after the 2026-10-01 design review.

- [x] Trigger rule and bounded notice contract recorded before implementation.
- [x] Contract decisions closed on 2026-10-02 under the user's delegated authority.
- [ ] False-positive and false-negative cases enumerated before implementation.
- [ ] Red tests written for every enumerated case.
- [ ] The notice never changes `valid` or `approved`.
- [ ] TASK-075 is covered as an inconclusive case, without an accusation of missing consultation.
- [ ] Detector limits are documented; only specified formatting edits are guaranteed silent.
- [ ] Protected root instructions changed only after an approved exact diff.
- [ ] Build, full tests, lint and required CLI checks run.
- [ ] Checklist completed before any snapshot capture, per TASK-051.
- [ ] Capsule ready for independent review; invocation requires user confirmation.
