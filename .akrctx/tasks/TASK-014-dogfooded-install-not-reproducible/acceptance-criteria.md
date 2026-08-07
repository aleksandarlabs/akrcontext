# Acceptance Criteria

- `doctor --json` on a pristine checkout of this repository produces no `error`-severity
  suggestion.
- The chosen direction is recorded in the capsule and does not weaken doctor's error for
  consumer projects (a missing agent file in a project that expects it stays an error).
- `pnpm build && pnpm test && pnpm lint` pass.
- The review checklist is completed before handoff.
