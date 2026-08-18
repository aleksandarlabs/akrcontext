# Task

## Goal

Fix race condition in `setConfigValue` where concurrent config writes can lose updates or corrupt the config file.

## Problem

In `src/config.ts:270-296`, `setConfigValue` performs a read-modify-write cycle without any locking:

```typescript
const current = (await readConfig(cwd)) ?? defaultConfig(["codex"]);
const next = structuredClone(current);
// ... modify next ...
await writeConfig(cwd, next, dryRun);
```

Two concurrent `akrctx config set` commands (or `config set` + `doctor --fix`) can:
1. Both read the same initial state
2. Both compute different updates
3. Both write, with the second overwriting the first

Additionally, `writeConfig` uses non-atomic `writeFile`, so a crash mid-write leaves a truncated JSON file.

## Root Cause

No file locking or atomic write mechanism is used for config updates. The filesystem provides no transactionality for multi-step read-modify-write operations.

## Solution

Implement one or both of:

### Option A: File locking (recommended)
Use `proper-lockfile` or similar to acquire a lock on `.akrctx/config.json.lock` before read-modify-write:

```typescript
import lockfile from "proper-lockfile";

async function setConfigValue(...) {
  const release = await lockfile.lock(configPath, { retries: 3 });
  try {
    // read-modify-write
  } finally {
    await release();
  }
}
```

### Option B: Atomic writes
Write to temp file, then rename (atomic on POSIX):

```typescript
const tempPath = `${configPath}.tmp.${process.pid}`;
await writeFile(tempPath, JSON.stringify(config));
await rename(tempPath, configPath);
```

### Option C: Both (belt and braces)
Combine locking with atomic writes for maximum safety.

## Validation

```bash
# Terminal 1
pnpm akrctx config set defaults.workflow TDD &

# Terminal 2 (immediately after)
pnpm akrctx config set defaults.target claude &

# Both should succeed; config.json should be valid JSON with both changes
```

## Out Of Scope

- Distributed locking (multi-machine)
- Changes to other config file formats

## Acceptance Criteria

- [ ] Concurrent config writes don't lose updates
- [ ] Config file is never left in truncated/corrupt state
- [ ] Performance impact is acceptable (<10ms overhead per write)
- [ ] Works on Windows, macOS, Linux

## Clarifications

### Session 2026-08-18

- **Option B only: atomic write, no locking, no third dependency.** Write to a temporary file in
  the same directory and rename over the target. The published package advertises two runtime
  dependencies and that is part of what it sells; a locking library is visible to every consumer
  and brings its own failure mode, a stale lock that hangs the CLI.
- This closes **corruption**, which is the damage that breaks every later command. It does **not**
  close the lost update: two concurrent `config set` calls can still leave only one of the two
  changes. That limit is stated in the documentation rather than papered over.
- The lost update is acceptable because of who hits it. `akrctx config set` is typed by a person,
  one command at a time. The realistic concurrent case is `config set` racing `doctor --fix`, which
  loses a setting the user can retype — not a corrupt file that requires re-running `init`.
- The "<10ms overhead" criterion is **deleted**. Nothing measures it, so it cannot gate a review.
- Locking stays available as a later capsule if the lost update turns out to bite in practice.

## Open Questions

- None recorded yet.
