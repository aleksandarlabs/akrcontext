# Review Checklist

## The definition was designed before code

- [ ] task.md states the new meaning of "installed" for all five states listed in plan.md step 1.
- [ ] The edited-file decision is recorded with its reasoning. A customised `CLAUDE.md` must still
      read as installed — akrctx's own policy is `preserve-and-suggest`.
- [ ] The pre-manifest decision is recorded under `## Clarifications`.
- [ ] `log.md` lists every consumer of `getInstalledTargets` and the tests that pin them.

## The false positive is gone, for all three targets

- [ ] A fixture with only a hand-written `AGENTS.md` reports no Codex install. Test present.
- [ ] The same for `CLAUDE.md` and Claude. Test present.
- [ ] The same for `.github/copilot-instructions.md` and Copilot. Test present.
- [ ] The readiness score for those fixtures is the uninstalled score, not merely a changed one.

## Every state is pinned

- [ ] No manifest — not installed. Test present.
- [ ] Manifest listing the target's files — installed. Test present.
- [ ] Manifest present, target absent — not installed. Test present.
- [ ] Manifest lists the file, file deleted — behaviour is deliberate and named. Test present.
- [ ] Manifest lists the file, hash no longer matching — still installed. Test present.
- [ ] Pre-manifest install behaves as decided. Test present.

## The blast radius was checked

- [ ] Every test whose score moved is explained in `log.md`. No snapshot was re-baselined without
      a written reason.
- [ ] `tests/dogfood.test.ts` passes. This repository's real install is recognised.
- [ ] `akrctx doctor --json` keeps its shape. Any changed field meaning is in `CHANGELOG.md`.
- [ ] The required-file list at `src/doctor.ts:195` still produces the right files for an
      installed target.

## Nothing else moved

- [ ] Gap messages unchanged.
- [ ] `--fix` behaviour unchanged.
- [ ] Wiki output unchanged.
- [ ] What `init` writes is unchanged.

## Documentation

- [ ] Any text describing how doctor detects an install was corrected.
- [ ] The documentation states the limit: detection trusts the manifest, which can itself be stale
      or hand-edited. No text implies detection is now exact.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] The manual check from task.md was run against a scratch repository, output in `log.md`.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
