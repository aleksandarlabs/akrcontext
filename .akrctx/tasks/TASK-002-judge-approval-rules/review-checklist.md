# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Tests or validation commands are defined.
- [x] Existing instructions were not overwritten.
- [x] New rules fire only for APPROVED records — pinned by
      "applies the approval rules only to APPROVED verdicts", which asserts the
      NEEDS_CHANGES reason list is exactly one entry.
- [x] `review.schema.json` `$id` is still `akrctx-judge-review-v1`; the
      "enable refuses a missing deterministic review contract" test still passes.
- [x] Generated agent files were regenerated via `akrctx upgrade`, not hand-edited.
      A second build + upgrade produced no further writes, so the manifest is in sync.
- [x] `pnpm test` passes — 193/193, including 5 new judge tests.
- [x] `pnpm lint` passes at repo root — `biome check .`, 38 files, exit 0.

## Notes

Fix 3 (`--cwd`) turned out smaller than first reported. No command in the CLI exposes
a `--cwd` flag; `cwd` only enters `CommandOptions` programmatically from tests. So
`judge scope` and `judge verify` calling `process.cwd()` directly had no runtime
difference from the rest of the CLI. Routed both through `normalizeOptions` anyway so
the shape matches every other action and a future `--cwd` works everywhere at once.

`addCommon` was deliberately not used for these two commands: it would have added
`--dry-run` and `--force`, which are meaningless for read-only commands.

`biome`'s `noThenProperty` rejects the JSON Schema `if`/`then` keyword. Suppressed at
that one line with a reason — the object is a schema literal in a generated-JSON
source, never awaited.

## Follow-up

Three gaps from the same review are still open and out of scope here:

1. Nothing binds a review record to the judge having actually run it. The primary
   agent can call `judge scope` itself and write a valid APPROVED record. This is the
   largest remaining hole in the gate.
2. `createJudgeScope` applies `policy.json` blocked-read patterns only to untracked
   files. A tracked `.env` still enters the diff and appears in `changedFiles`.
3. Review records carry no `cliVersion` provenance.
