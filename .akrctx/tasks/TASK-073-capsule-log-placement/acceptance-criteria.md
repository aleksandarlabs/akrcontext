# Acceptance Criteria

- `src/templates/instructions.ts`, `src/templates/wiki.ts` and `src/templates/defaults.ts` name `.akrctx/local/impl/<TASK-ID>/log.md` as the implementation-note location. No source template names a log inside `.akrctx/tasks/TASK-XXX/`.
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
