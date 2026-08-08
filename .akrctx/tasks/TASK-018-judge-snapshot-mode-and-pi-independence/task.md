# Task

## Goal

Fix the two layers of judge problems found while self-reviewing TASK-017.

**Layer A — judge tooling bugs.**
1. **Snapshot stability is mode-sensitive.** `workspaceManifest`/`addManifestPath`
   (`src/judge-snapshot.ts`) hash `file:${mode & 0o777}\0<content>`, so a fresh `git checkout` at
   umask 0002 (mode 664) does not match tracked files at 644. `akrctx judge snapshot` fails its
   stability check in any mixed-umask environment, with no fallback. Fix: the stability manifest
   hashes content + type, not unix permission bits. The stability/integrity check exists to detect
   content drift during capture, not permission drift; mode is not a tamper signal here (the scope
   digests bind the boundary; git tracks mode in the tree). Existing local snapshots' IDs change —
   local + ephemeral, recapture; documented.
2. **The capture error message lies.** The `manifestDigest(live) !== manifestDigest(snapshot)`
   throw says "retry after file writes settle", implying a transient race. It is a deterministic
   snapshot-vs-live mismatch. The transient race is the separate `sameLiveBoundary` two-pass check.
   Fix: the deterministic throw names the differing paths and says it is not a transient race; the
   two-pass retry keeps its transient semantics.
3. **The WORKTREE fallback is undocumented.** The judge agent template says "if the boundary fails,
   report BLOCKED" but never mentions that `WORKTREE` is a compatible candidate. Fix: the judge
   agent template + `docs/JUDGE.md` state that if a snapshot cannot be captured the reviewer falls
   back to `WORKTREE` and records which boundary was used, and does not BLOCKED solely because the
   snapshot is unavailable.

**Layer B — Pi self-review honesty.** Pi has no agent format, so the judge cannot run as an
independent subagent; the same session that implemented read the skill and self-reviewed, which
compromises the independence the judge exists to provide. The mechanical half (re-execute tests,
bind digests) survives without independence; the judgment half does not. Fix:
4. Add an optional `independent` boolean to the review record (schema stays v2; field optional,
   default `true` by absence for backward compatibility). `validateRecord` allows it;
   `JudgeReviewRecord` carries it.
5. The judge agent template instructs the reviewer to set `independent: false` when they are the
   same session/agent that implemented, or when running on a host with no subagent isolation (Pi),
   and to say so in `issues` is wrong — instead the record carries the flag and `verify` reports it.
6. `akrctx judge verify` reports a **notice** when `independent === false` ("Review was marked
   non-independent; the verdict is verification-only, not independent judgment"). It does not change
   `valid`/`approved` — the mechanical guarantees hold; independence is a judgment the comprehension
   gate enforces. The comprehension-agent template is updated to require `independent: true`, so a
   non-independent approval does not satisfy the comprehension gate.
7. The Pi decision record (2026-08-06), judge agent template, `docs/JUDGE.md`, and
   comprehension-agent template state explicitly: Pi has no agent format; a same-session judge is
   verification-only and must mark `independent: false`; for independent judgment run from another
   host (Claude Code/Codex/Copilot subagent) or a separate session.

This is convention + schema + comprehension refusal, not cryptographic independence — consistent
with the project's stated stance that policy is prompt-level and does not resist a determined
adversary. Its value is making honest self-reviewers flag themselves and preventing a flagged
record from quietly satisfying the comprehension gate.

## Validation

```
pnpm build && npx vitest run
```

## Out Of Scope

- Adding a subagent surface to Pi (out of akrctx's reach).
- Cryptographically proving reviewer identity or session isolation.
- Bumping the review schema to v3 — `independent` is an optional, backward-compatible v2 field.
- Changing `akrctx judge current` to support WORKTREE-approved reviews. Fixing A1 (mode) unblocks
  snapshots, which unblocks `judge current` and the comprehension cascade at the root; extending
  `current` to WORKTREE is a separate concern.
- Removing or migrating legacy agent keys (that is TASK-017's recorded sunset, not this task).
- Touching TASK-017's already-verified review records; the `independent` convention applies forward.

## Clarifications

### Session 2026-08-08

- `independent` defaults to `true` when absent, so existing v2 records keep verifying unchanged. A
  reviewer who is non-independent must explicitly set `false`.
- `verify`'s `approved` field stays mechanical (record is a valid APPROVED matching the repo +
  tests pass). Independence is reported as a notice and enforced by the comprehension gate, not by
  `verify`'s exit code. Rationale: `approved` means "mechanically a valid approval"; independence is
  orthogonal and judgment-based.
- A non-independent record may still be `APPROVED` with empty `issues` — the flag is the honest
  signal, not an issue. The reviewer's prose about why they are non-independent is not required in
  `issues` (the flag carries it).

## Open Questions

- None recorded yet.