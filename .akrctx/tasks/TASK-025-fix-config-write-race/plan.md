# Plan

## Workflow

- research-first, then TDD

## Why

`workflowRules` maps `unknownArea` to research-first and `bugfix` to TDD. This task is both, in
that order.

Research comes first because two questions decide the design and neither is answered. Whether a
third runtime dependency is acceptable is a product decision — the published package advertises
two, and that is part of what it sells. And whether the concurrency failure can be reproduced
reliably in a test decides whether the locking half is verifiable at all; a race that only fails
one run in fifty produces a test that passes by luck and a criterion nobody can check.

TDD then applies to the atomic-write half, which is straightforwardly testable: force a failure
between write and rename, assert the target is intact and no temporary file survives.

`fast-patch` was rejected. This changes how akrctx's own configuration is persisted, and a
half-written `config.json` breaks every subsequent command.

`SDD` was rejected: the file format and the key set are unchanged, so no contract between
programs moves.

## Steps

### Research — before writing any fix

1. Answer the dependency question. Decide whether a locking library is acceptable, or whether
   locking is implemented on `fs` primitives, or whether locking is dropped and only atomicity is
   delivered. Record the answer and the reasoning under `## Clarifications` in task.md. This is a
   decision about the published package, not an implementation detail.
2. Establish whether the lost update is reproducible in a test. Run two concurrent
   `setConfigValue` calls on different keys, many times, and record how often one is lost. If it
   is rare, say so in `log.md` and design the test around forcing the interleaving rather than
   hoping for it.
3. Measure the current write cost, so the "<10ms overhead" figure in task.md is either backed by
   a number or deleted. An unmeasured performance criterion cannot gate a review.
4. Check the Windows rename-over-existing-file behaviour, or confirm CI covers this path.

### Atomic write

5. Write the failing test: force a failure between write and rename, assert the existing
   `config.json` is intact and the directory holds no leftover temporary file.
6. Implement write-to-temp-then-rename in `writeConfig` (`src/config.ts:92`), with the temporary
   file in the same directory as the target so the rename stays on one filesystem.
7. Make the temporary name collision-proof between concurrent writers, and test it.
8. Assert `--dry-run` still writes nothing at all, including no temporary file.

### Locking, if step 1 chose it

9. Write the concurrency tests: two writers on different keys keep both changes; two writers on
   the same key yield one of the two values and never a merged object.
10. Cover both read-modify-write paths. `setConfigValue` returns early into `writeAgentKey` on the
    `agents.` prefix, so a lock placed only in the first path is bypassed by every `agents.*` set.
11. Implement, then test stale-lock recovery: a lock left by a dead process is recovered, the wait
    is bounded, and the timeout produces a named error rather than a hang.

### Close out

12. If locking was not chosen, state in `bench`-free plain terms in the documentation which
    guarantee is not delivered. Atomic rename prevents corruption, not a lost update.
13. `CHANGELOG.md`, additive only, continuations indented two spaces.
14. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **`writeAgentKey` bypasses the main path.** `setConfigValue` returns early for `agents.` keys.
  A lock added around the visible read-modify-write leaves every agent config write unprotected,
  and nothing fails visibly. Step 10 exists for this.
- **A race test that passes by luck is worse than no test.** It turns green permanently and hides
  a regression. If step 2 shows the failure is rare, the test must force the interleaving.
- **A lock file is a new failure mode.** A crashed process leaves a lock, and a CLI that hangs
  waiting for it is worse than the race it prevents. Bounded wait and a named error are not
  optional.
- **A third runtime dependency is visible to every consumer** of the published package, and this
  one runs on developer machines and in CI. It is a small library, but the decision is the
  project's, not the implementer's.
- **`rename` semantics differ on Windows** for an existing target. The atomic half is the part
  most likely to be portable-by-assumption.
- Other akrctx files are written by the same read-modify-write shape. Fixing only `config.json`
  leaves the pattern in the codebase for the next writer to copy.
