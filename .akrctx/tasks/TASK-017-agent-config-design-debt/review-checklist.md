# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Tests or validation commands are defined.
- [x] Existing instructions were not overwritten.

## trigger advisory

- [x] CONFIGURATION.md documents `trigger` as a host-interpreted hint.
- [x] `types.ts` doc-comment matches in one line.

## Decision records

- [x] Legacy mirroring sunset record dated, with exit criteria.
- [x] Model patterns maintenance record dated, with false-positives named.
- [x] Closed extension surface record dated, with reconsideration trigger.

## init narrowing warning

- [x] Warning fires for enabled agent + explicit `targets` omitting a newly added target.
- [x] No warning for the common case (no explicit `targets`), disabled agent, or already-covered.
- [x] Re-running `init --target <already-installed>` warns nothing (only newly added targets warn).
- [x] `--target all` warns per newly added uncovered target (consistent, not a special case); already-present targets never warn.
- [x] Warning is non-blocking; `init` still writes the target.
- [x] `--dry-run` writes nothing (covered by existing accumulation test).

## Cross-cutting

- [x] `pnpm build && npx vitest run` passes in full (703 tests).
- [x] `npx tsc --noEmit` adds no new error (pre-existing evals/akrctx.test.ts errors only).
- [x] `pnpm lint` clean.
- [x] No installed harness copy hand-edited.