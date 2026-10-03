# TASK-085 — Release 0.7.0

## Goal

Bring the user-facing documentation up to date with every change since `v0.6.0`, then prepare
release 0.7.0 by following `docs/RELEASE_CHECKLIST.md`. The agent prepares the release commit;
the human creates the tag after the commit lands on main.

## Problem evidence

`v0.6.0` is the latest tag, and main carries about 30 commits after it. The `[Unreleased]`
section of `CHANGELOG.md` covers work up to TASK-075, but none of the following tasks added an
entry or touched `docs/`:

- TASK-079 template provenance in `akrctx upgrade` (commit 5828c0e).
- TASK-083 honest verify header (commit 5828c0e).
- TASK-084 stable criterion identifiers and the `Retired: AC-<n>` footer (commit 5828c0e).
- TASK-081 checklist split into Evidence References and Process Attestations (66d9b28).
- TASK-082 `akrctx task show` reads the workflow from `plan.md` (5208c9d).
- TASK-076 read-only `akrctx judge rounds` report (a6239e8).
- TASK-077 `proof-command:` and `proof-doc:` criterion declarations (0a21597, edfe8cd).
- TASK-078 non-blocking clarification signal in verify (ed094b6).

TASK-080 (`akrctx judge reproduce`) already added its CHANGELOG entry and a `docs/JUDGE.md`
section. `docs/COMMANDS_AND_UX.md` lists neither `judge rounds` nor `judge reproduce`.
`docs/JUDGE.md` does not describe proof declarations, the clarification signal or rounds.

`src/version.ts` and `package.json` both read 0.6.0. The checklist says a minor bump marks new
features while the major version is 0, so the next version is 0.7.0.

## Contract

- Every change since `v0.6.0` that a user of the CLI or the shipped harness can observe has
  one CHANGELOG entry under Added, Changed or Fixed. Derive entries from the commits and the
  capsules' contracts and Clarifications, not from implementation logs. Internal capsule
  bookkeeping commits (`chore(task)`) get no entry.
- Keep existing `[Unreleased]` entries. Correct one only if it is now false, and say why in the
  implementation log.
- Follow the existing CHANGELOG style: one bullet per change, the command or file first, plain
  description of behavior and limits.
- Update `docs/COMMANDS_AND_UX.md` and `docs/JUDGE.md` for the commands and behaviors listed
  above. Update another doc only where it is now false.
- Release steps 1 to 5 of `docs/RELEASE_CHECKLIST.md`: rename `[Unreleased]` to
  `[0.7.0] - <release date>`, add a new empty `[Unreleased]` above it, set `src/version.ts` and
  `package.json` to 0.7.0, run the checks. Update the CHANGELOG comparison links if the file
  has them.
- If the version bump changes generated harness files or the manifest, regenerate them through
  the CLI. Never edit shipped files by hand.
- The agent never creates a tag and never pushes. It proposes the tag command for the human.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
pnpm akrctx config show
pnpm akrctx task "Define invoice API examples" --workflow SDD+EDD --dry-run --json
```

## Out Of Scope

- Code changes to any feature, including the open follow-ups from TASK-076, 077, 078 and 081.
- npm publishing, pushing, or creating the tag.
- Rewriting docs that are still correct.
- Editing task capsules other than this one.

## Clarifications

Ambiguity resolved with the human before implementation. Ask only when two plausible
answers would produce different code, validation, or scope. Group answers under a
`### Session YYYY-MM-DD` heading, and propagate any that changes a criterion into
acceptance-criteria.md. One answer per top-level `- ` bullet; only those are read.

### Session 2026-10-03
- The human chose one task for documentation and release: complete the CHANGELOG and docs,
  bump to 0.7.0, run the release checks, and then the human tags `v0.7.0` after the commit lands
  on main. Documentation is not split from the version bump.

## Open Questions

Ambiguity still unresolved. Nothing here blocks mechanically, but the judge reads it:
an approval granted while one of these would have changed the implementation is an
approval against a goal nobody agreed on. Record the question; never assume the answer.
One question per top-level `- ` bullet; only those are read.

- None.
