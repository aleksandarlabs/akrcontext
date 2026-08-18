# Plan

## Workflow

- SDD+TDD

## Why

`workflowRules` maps `apiOrContract` to SDD+TDD, and this task changes a contract even though it
looks like a bugfix.

"Installed" is a term akrctx reports to the user, uses to compute the readiness score, and exposes
through `doctor --json`. This task changes what the word means: from "a file with this name
exists" to "akrctx put this file here". Every consumer of that answer is affected, including
scripts reading the JSON. Deciding the new definition — and in particular what happens to an
install predating the manifest, and to a file the user has edited — is design work that must be
settled before code, which is what SDD is for.

TDD applies because the failure mode is a wrong boolean. Each state must be pinned by a test, and
the states are enumerable.

`fast-patch` was rejected: this changes doctor's headline number for every repository.

`research-first` was rejected: the manifest already exists and its shape is readable. There is
nothing to discover, only something to decide.

## Steps

### Design — before any code

1. Write down the new definition of "installed", state by state, in task.md:
   - no manifest;
   - manifest listing this target's files;
   - manifest present, this target absent;
   - manifest lists the file, file deleted from disk;
   - manifest lists the file, file present, hash no longer matching.
2. Decide the last one deliberately. akrctx's policy is `preserve-and-suggest`, so a user editing
   their `CLAUDE.md` is doing what the harness invites. Reporting that as uninstalled would punish
   the intended workflow.
3. Decide what happens to installs made before the manifest existed. Reporting a working install
   as absent is a regression for existing users; a fallback that guesses reintroduces the bug.
   Record the answer and its reasoning under `## Clarifications`.
4. Identify every consumer of `getInstalledTargets`: the required-file list at `src/doctor.ts:195`,
   the readiness score, and the `--json` shape. List them in `log.md` with the tests that pin them.

### Test

5. Write the failing test first: a fixture with only a hand-written `AGENTS.md` reports no Codex
   install and the uninstalled readiness score.
6. Add the same for `CLAUDE.md` and `.github/copilot-instructions.md`. The bug is in
   `presence.some(Boolean)` over `targetRequired[target]`, whose first entry is the root
   instruction file for every target — so all three are affected, not only Codex.
7. Add one test per state from step 1.
8. Add the pre-manifest test pinning the step 3 decision.

### Implement

9. Change `getInstalledTargets` (`src/doctor.ts:331`) to read provenance from
   `.akrctx/manifest.json`. `readManifest` already returns `undefined` for a malformed manifest,
   so absent and invalid collapse into one case.
10. Re-run the tests identified in step 4. Any score that moves is explained in `log.md`, not
    silently re-baselined.
11. Confirm `tests/dogfood.test.ts` passes. This repository has a real install with a manifest, so
    it is the end-to-end proof the new detection recognises a genuine one.

### Close out

12. Correct any documentation describing how doctor detects an install.
13. `CHANGELOG.md`, additive only, continuations indented two spaces. If the `--json` meaning
    changed, say so.
14. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **The edited-file case is the one that will be got wrong.** A hash-strict check reports every
  customised instruction file as uninstalled, which is worse than the false positive being fixed
  and affects far more users. Step 2 exists for this and the test in step 7 keeps it fixed.
- **Existing users with pre-manifest installs.** Whatever is chosen, someone's doctor output
  changes. Choosing silently is the failure; choosing and saying so is not.
- **The readiness score moves for every repository.** Tests that encode the old score will fail,
  and the temptation is to re-baseline them without reading why. Step 10 forbids that.
- **Fixing only Codex.** task.md frames this as an `AGENTS.md` problem. It is a
  `presence.some(Boolean)` problem, and the same false positive exists for Claude and Copilot. A
  fix for one target leaves the audit finding half-open.
- A manifest can itself be stale or hand-edited. The new check trusts it; state that limit in the
  documentation rather than implying detection is now exact.
