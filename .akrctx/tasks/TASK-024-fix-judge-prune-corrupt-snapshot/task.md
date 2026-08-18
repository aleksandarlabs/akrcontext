# Task

## Goal

Fix `judge prune` crashing on corrupt or incomplete snapshot directories, leaving the prune operation permanently broken.

## Problem

In `src/judge-snapshot.ts:389`, `pruneJudgeSnapshots` iterates over snapshot directories and calls `JSON.parse(await readFile(path.join(root, "snapshot.json"), "utf8"))` without any error handling:

```typescript
const snapshots = await Promise.all(
  entries.map(async (id) => {
    const root = path.join(snapshotsRoot, id);
    const info = await stat(root);
    const metadata = JSON.parse(await readFile(path.join(root, "snapshot.json"), "utf8"));
    // ...
  }),
);
```

A snapshot directory can exist without `snapshot.json` if:
- A previous `rm` was interrupted after deleting children but before deleting the directory
- Manual filesystem manipulation
- Disk corruption

When this happens, the entire `Promise.all` rejects with ENOENT, and `judge prune` fails permanently — no snapshots are pruned even if only one is corrupt.

## Root Cause

The code assumes all directories matching the snapshot ID pattern (`^[0-9a-f]{20}$`) are valid snapshots with readable metadata. It doesn't handle the case where `snapshot.json` is missing or unreadable.

## Solution

Add error handling to skip corrupt snapshots during prune:

1. Wrap the `readFile`/`JSON.parse` in a try-catch
2. Log a warning about the corrupt snapshot
3. Continue processing other snapshots
4. Optionally: include corrupt snapshots in the removal list (they're useless anyway)

## Validation

```bash
# Create a corrupt snapshot (directory without snapshot.json)
mkdir -p .akrctx/local/judge/snapshots/aaaa1111bbbb2222cccc

# This should not crash and should prune other snapshots
pnpm akrctx judge prune --keep 5 --force

# Should complete successfully with warning about corrupt snapshot
```

## Out Of Scope

- Automatic recovery of corrupt snapshots
- Changes to snapshot creation/validation (only prune is affected)

## Acceptance Criteria

- [ ] `judge prune` handles missing `snapshot.json` gracefully
- [ ] Other snapshots are still pruned correctly
- [ ] Warning is logged about skipped corrupt snapshots
- [ ] No crash on unexpected filesystem states

## Clarifications

### Session 2026-08-18

- A corrupt snapshot is **reported and skipped, never deleted**, in any mode including `--force`.
  A snapshot directory missing its metadata can mean an interrupted `rm`, or it can mean someone
  removed the metadata. The second case is exactly what a review boundary exists to make visible,
  and "prune tidied it away" is the wrong answer to it. Reclaiming a few megabytes does not justify
  destroying the evidence.
- Removing a corrupt snapshot stays possible by hand. The prune output names the directory, so a
  developer who has decided it is junk can delete it themselves.

## Open Questions

- None recorded yet.
