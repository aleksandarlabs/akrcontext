# Acceptance Criteria

- `src/templates/instructions.ts`, `src/templates/wiki.ts` and `src/templates/defaults.ts` name `.akrctx/local/impl/TASK-XXX/log.md` (short task ID, no slug) as the implementation-note location. No source template names a log inside `.akrctx/tasks/TASK-XXX/`.
- A generated `policy.json` carries `writePolicy.implementationNotes` pointing at the local path.
- A grep across `src/templates/` finds no remaining statement that an implementation log belongs in a capsule.
- The implementer contract's read path and the write policy name the same file. An implementer that follows both reads the log it wrote.
- `akrctx doctor` reports a capsule holding a `log.md` as a finding, names the task, and explains that the file sits inside the reviewed boundary. `--json` carries the same finding.
- Doctor never moves, deletes or rewrites a log. A repository with offending capsules still reports cleanly on every other axis.
- Tests pin the corrected write-policy wording and the absence of the old wording, in the same style as the TASK-071 template tests.
- Tests cover the Doctor finding: present when a capsule holds a `log.md`, absent when none does.
- `review-checklist.md` stays inside `taskDigest`. No change relaxes capsule-change detection.
- Protected root instruction files change only after an exact minimal diff is shown and approved in the same conversation. Without that approval the delivery ships the suggested-file path instead.
- Build, full tests, lint, init dry-run and Doctor pass.
- `akrctx task` creates no directory under `.akrctx/local/impl/`. The `akrctx impl` store stays the only creator, on first write.
- This delivery moves, deletes or edits no existing capsule `log.md`, and leaves every file in the TASK-071 capsule unchanged.
- `akrctx upgrade` removes the exact entry `.akrctx/tasks/TASK-XXX/log.md` from `writePolicy.implementationNotes`; the existing union then adds the new default. `[old]` becomes `[new]`, `[X]` becomes `[new, X]`, `[old, X]` becomes `[new, X]`. Merge semantics for other keys do not change.
- `akrctx upgrade` replaces the exact old implementation-notes line in an existing `.akrctx/wiki/write-policy.md`, and leaves the rest of the page and any customized page unchanged.
- Tests cover both upgrade migrations: old default replaced, custom entries kept, second run is a no-op.
- This repository's `.akrctx/policy.json` and `.akrctx/wiki/write-policy.md` are regenerated with `akrctx upgrade`, not edited by hand.
