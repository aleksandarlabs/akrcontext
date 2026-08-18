# Acceptance Criteria

## The false positive is gone

- A repository containing a hand-written `AGENTS.md` and nothing else from akrctx is not reported
  as having the Codex target installed.
- A test proves it: build a fixture with only `AGENTS.md`, run doctor, assert `codex` is absent
  from the installed targets and that the readiness score is the uninstalled score.
- The same test covers `CLAUDE.md` for the Claude target and
  `.github/copilot-instructions.md` for Copilot. `getInstalledTargets` in `src/doctor.ts:331` uses
  `presence.some(Boolean)` over `targetRequired[target]`, whose first entry is the root instruction
  file for every target. All three have the same bug, not just Codex.

## Detection is based on provenance, not on a filename

- `.akrctx/manifest.json` already exists and already records managed files with a `sha256:` hash
  per path (`src/manifest.ts`). Detection uses it. `readManifest` already returns `undefined` for
  a malformed manifest, so the absent-and-invalid cases collapse into one.
- A test covers each state explicitly:
  - no manifest at all — target not installed;
  - manifest listing the target's files — target installed;
  - manifest present but not listing this target — target not installed;
  - manifest listing the file, but the file deleted from disk — the reported state is deliberate
    and named, not whatever falls out;
  - manifest listing the file, file present but hash no longer matching (user edited it) — target
    still reported installed, because a customised instruction file is the normal case and must not
    read as uninstalled.
- The last case is the one most likely to be got wrong. akrctx's own policy is
  `preserve-and-suggest`; a user who edits their `CLAUDE.md` is doing what the harness invites.

## The blast radius is contained

- `getInstalledTargets` feeds the required-file list at `src/doctor.ts:195` and the readiness
  score. Changing it changes what doctor reports for every repository. The tests that pin the
  score are identified in `log.md` before the change, and any that move are explained.
- `tests/dogfood.test.ts` still passes. This repository has a real akrctx install with a manifest,
  so it is the end-to-end proof that the new detection recognises a genuine install.
- A repository installed by an older akrctx that predates the manifest is reported as **not
  installed**, with a message naming the reason and telling the user to re-run `init`. A test pins
  it. No fallback to the old filename check exists anywhere, because that would reintroduce the
  false positive for every repository without a manifest.
- The message says that re-running `init` preserves existing instruction files. A user told they
  are not installed, when they are, will assume the tool is broken unless the message explains
  itself. A test asserts the message contains both the reason and the remedy.
- Documentation stating how doctor detects an install is corrected if this change makes it wrong.

## Nothing else moved

- No change to the gap messages, the fix behaviour, or the wiki output.
- No change to what `init` writes.
- `akrctx doctor --json` keeps its shape. If a field's meaning changes, `CHANGELOG.md` says so.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- The manual check from task.md is run and its output recorded in `log.md`: a scratch repository
  with a hand-written `AGENTS.md` reports no Codex install.
- `CHANGELOG.md` records the fix under the unreleased section, additive only, continuations
  indented two spaces.
