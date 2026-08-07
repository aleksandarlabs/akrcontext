# Acceptance Criteria

## Accumulation

- `init --target copilot` then `init --target claude` leaves `targets` as
  `["copilot", "claude"]`, and `akrctx judge enable` writes the agent file for both.
- Re-running `init` with a target already listed leaves `targets` unchanged and does not
  duplicate the entry.
- `init --target all` results in every target being listed.
- `targets` is never shortened by `init`.

## Preservation

- `defaults.target` keeps the value from the first install after a repeat run with a
  different target.
- A user-modified setting in an existing config — a workflow default, the profile, an
  `agents` entry, an unknown entry — survives a repeat `init` unchanged.
- A first `init` in an empty repository behaves exactly as before.

## The contradiction is gone

- After `init --target copilot` followed by `init --target claude`, `akrctx doctor`'s
  installed targets and `config.targets` agree, and no agent warning claims that a target
  the user just installed is not installed.

## Reporting

- The write for `.akrctx/config.json` reports as an update when the target list changed and
  as unchanged when it did not, consistent with the write reporting introduced in TASK-012.
- `--dry-run` writes nothing.

## Cross-cutting

- `pnpm build && npx vitest run` passes in full.
- `npx tsc --noEmit` adds no new error.
- `akrctx doctor --fix`, which calls `runInit` per detected target, still works and does not
  shrink or scramble the target list.
