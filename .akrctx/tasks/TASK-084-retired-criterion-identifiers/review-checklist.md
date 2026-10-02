# Review Checklist

- [x] Contract decisions closed on 2026-10-02 under the user's delegated authority.
- [x] Red tests written before implementation, using the three real capsules as fixtures.
- [x] Existing tests that pinned unconditional renumbering reviewed, not deleted silently.
- [x] Only known retirement footers are added; no active criterion is renumbered or repurposed.
- [x] `migrate-criteria --dry-run` reports no change across every capsule.
- [x] Reader and migration command agree on what needs repair.
- [x] Build, full tests, lint and required CLI checks run.
- [x] Checklist completed before any snapshot capture, per TASK-051.
- [x] Capsule ready for independent review; the user explicitly authorized invocation on 2026-10-02.
