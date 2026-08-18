# Review Checklist

## Research came first

- [ ] `log.md` records the byte-for-byte comparison of the two bodies. If they had drifted, that
      was reported rather than resolved by picking one.
- [ ] `log.md` records whether a static import creates a cycle, and the dependency direction.
- [ ] If a cycle exists, the chosen resolution is recorded. No second dynamic import was added as
      a reflex.

## One definition remains

- [ ] `grep -rn "function matchesBlockedPattern" src` returns exactly one line.
- [ ] The survivor is the exported one at `src/judge-enforcement.ts:553`, or the function moved to
      a leaf module and every importer was updated.
- [ ] `src/judge-snapshot.ts` call sites at lines 558 and 657 behave unchanged.
- [ ] `src/hook/index.ts` call sites at lines 154 and 215 behave unchanged.

## The cycle check was real

- [ ] `pnpm build` passes.
- [ ] The **built CLI was run** on a command that exercises blocked patterns, and the output is in
      `log.md`. Compiling is not the check — an ESM cycle yields an undefined binding at runtime.

## The security boundary did not move

- [ ] Every branch is covered by a test: trailing-slash directory, `*.ext` suffix, `name.*` prefix,
      exact segment match, full-path equality.
- [ ] A path containing a backslash separator still normalizes. Test present.
- [ ] `tests/hook.test.ts` passes unmodified.
- [ ] The judge snapshot tests in `tests/akrctx.test.ts` pass unmodified.
- [ ] What gets excluded from a snapshot is unchanged. Verified against a real capture, not
      inferred from the diff.

## Ordering

- [ ] This task's order relative to TASK-026 is recorded in task.md.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
