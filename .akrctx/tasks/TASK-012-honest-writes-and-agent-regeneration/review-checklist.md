# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Tests or validation commands are defined.
- [x] Existing instructions were not overwritten.

## Regeneration

- [x] The QA sequence is covered by a test and passes.
- [x] All three enable commands regenerate.
- [x] An unchanged re-enable reports unchanged and rewrites nothing.
- [x] `--dry-run` still writes nothing.
- [x] No protected file became overwritable.

## Reporting

- [x] Markers differ by kind.
- [x] A preserved file never carries the creation marker.
- [x] init counts and grouping still correct.
- [x] `--json` unchanged.

## Gaps

- [x] init names `akrctx impl enable`.
- [x] CHANGELOG records the doctor threshold change.

## Cross-cutting

- [x] `pnpm build && npx vitest run` passes in full.
- [x] `npx tsc --noEmit` adds no new error.
