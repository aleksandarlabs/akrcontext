# Acceptance Criteria

## The config file is never left truncated

- `writeConfig` in `src/config.ts:92` no longer writes in place with a bare `writeFile`. It writes
  to a temporary file in the same directory and renames over the target, so a reader sees either
  the old file or the new one.
- The temporary name cannot collide between concurrent writers. A test asserts two writers running
  at once do not clobber each other's temporary file.
- A failed write leaves no temporary file behind. A test forces a failure between write and rename
  and asserts the directory is clean.
- The same atomic path applies to any other akrctx file written by a read-modify-write cycle in
  this module. If `writeManifest` or the policy writer share the shape, either they are covered
  too or task.md states why they are out of scope.

## No locking, and the gap is stated out loud

- No locking library is added. `package.json` still lists exactly two runtime dependencies after
  this change.
- A concurrent write can still lose an update, and the documentation says so in plain words. No
  text anywhere claims `config set` is safe to run concurrently.
- `CHANGELOG.md` describes what was fixed as corruption, not as a race. Someone reading it must not
  come away believing the lost update was closed.
- The concurrent case is still covered by a test, asserting the honest property: after two
  concurrent writes the file is **valid JSON containing one of the two states**, never a truncated
  or merged object. That is the guarantee delivered, so that is what is pinned.
- `writeAgentKey` is covered by the same atomicity. `setConfigValue` returns early on the `agents.`
  prefix, so a fix applied only to the visible write path leaves every `agents.*` set unprotected.
  A test writes through that path and asserts atomicity holds there too.

## Portability is proven, not asserted

- `rename` over an existing file behaves differently on Windows. A test covers the overwrite case,
  or task.md records that Windows is verified by CI on this path.
- The temporary file is created in the same directory as the target, so the rename stays within one
  filesystem.
- The "<10ms overhead" criterion is deleted from task.md. Nothing measures it, so it cannot gate a
  review.

## Behaviour otherwise unchanged

- The set of valid config keys, their parsing, and their error messages are unchanged.
- `--dry-run` still writes nothing, including no temporary file. A test asserts this.
- `readConfig` behaviour on a missing or invalid file is unchanged.
- The file format is unchanged: two-space JSON with a trailing newline.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- `CHANGELOG.md` records the fix under the unreleased section, additive only, continuations
  indented two spaces.
