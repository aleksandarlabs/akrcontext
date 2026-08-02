# Acceptance Criteria

## (a) A corrupt config never silently weakens the contract

- AC1. `readConfig` throws on a `config.json` that is not valid JSON, and still returns
  `undefined` when the file is simply absent. The absent case must stay distinguishable,
  because "not installed" and "broken" call for different advice.
- AC2. `runTask` fails on a corrupt config instead of selecting a workflow. It must not
  reach `selectWorkflow` with `config === undefined`, which is what grants every workflow.
- AC3. Exactly one caller tolerates a corrupt config: `doctor`, whose job is to diagnose
  broken repositories. That tolerance is expressed by a separately named reader, not by
  the default one, and `akrctx doctor` still reports the corruption as a config gap.

## (b) No invented target

- AC4. `normalizeConfig` throws when the parsed value is not an object (`null`, an array,
  a number) instead of returning a codex-targeted default config.
- AC5. `normalizeConfig` throws when the config declares no recognizable target instead
  of substituting `["codex"]`.
- AC6. `akrctx doctor` reports a config with no valid target as a gap rather than
  crashing on it.

## (d) One canonical capsule file list

- AC7. A single exported constant names the five capsule files, and
  `harness-files.ts`, `judge-enforcement.ts`, and `task.ts` all derive from it rather
  than repeating a literal list.
- AC8. The shipped `_template` capsule contains all five files, including
  `acceptance-criteria.md`.
- AC9. `akrctx judge scope` succeeds against a capsule copied verbatim from `_template`.
  This is the regression the defect actually produced and must be tested end to end.
- AC10. `akrctx doctor` requires the fifth template file, and `akrctx upgrade` creates it
  for an installation that predates this change without overwriting anything else.

## Added after review

Two findings from the independent review. Both are in scope: the first is the same
defect (b) on a path the original criteria missed, and the second is what AC7 was
actually asking for.

- AC14. `doctor --fix` must not invent a target either. When the config names no
  recognizable target the repair leaves the file untouched and the gap stands, so
  readiness cannot reach 100 by guessing. A partly invalid list is still repaired from
  the entries that are trustworthy.
- AC15. The capsule list is canonical for *producers*, not just consumers. Adding an
  entry to `capsuleFiles` must fail the build until `akrctx task` and the shipped
  `_template` both supply content for it. Runtime tests cannot express this, so the
  guarantee is type-level and the tests iterate the constant instead of repeating it.

## Cross-cutting

- AC11. `pnpm test` and `pnpm lint` pass.
- AC12. The existing test asserting that `readConfig` returns `undefined` on corrupt JSON
  is updated rather than deleted, since it pinned the behavior this task inverts.
- AC13. No change to judge approval rules, the comprehension gate, or protected-file merge.
