# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Tests or validation commands are defined.
- [x] Existing instructions were not overwritten.
- [x] Edit landed in the template source, not in generated skill output.
- [x] Protected instruction merge section is byte-identical to before.
- [x] Rubric writes only to paths allowed by `writePolicy.doctor`.
- [x] `pnpm test` passes — 188/188, including Doctor merge-workflow, rubric
      propagation, scoped Copilot metadata, and persistent-audit coverage.
- [x] `pnpm lint` passes at repo root — `biome check .`, 39 files, exit 0.
- [x] Capsule carries all five files `akrctx judge scope` fingerprints.

## Notes

`pnpm lint` used to fail on 6 formatter errors in generated `.akrctx/**` JSON. Fixed by
adding `.akrctx/` to `files.ignore` in `biome.json`: it is generated output like `dist/`,
and formatting it would desynchronize the files from the sha256 hashes in
`.akrctx/manifest.json`. Rationale recorded in `.akrctx/wiki/testing.md`.

Acceptance criteria were originally inline in `task.md`, which left the capsule without
`acceptance-criteria.md` and blocked the judge. Moved to their own file.

## Follow-up

The installed copy at `.claude/skills/akrctx-doctor/SKILL.md` was regenerated through the
normal init/upgrade path — verified byte-identical to the template output and matching its
`.akrctx/manifest.json` hash. Not hand-edited.

`_template` ships 4 capsule files while `src/task.ts` and `src/judge-enforcement.ts`
expect 5. Logged in `.akrctx/wiki/gaps.md`; needs its own task.

The follow-up implementation separates the deterministic CLI Doctor from the semantic
Doctor skill. Semantic findings now persist in `wiki/instruction-audit.md`, which the
CLI does not regenerate.
