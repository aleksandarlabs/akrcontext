# Acceptance Criteria

- AC-1: `doctor --json` on a pristine checkout of this repository produces no `error`-severity
  suggestion.
- AC-2: The chosen direction is recorded in the capsule and does not weaken doctor's error for
  consumer projects (a missing agent file in a project that expects it stays an error).
- AC-3: `pnpm build && pnpm test && pnpm lint` pass.
- AC-4: The review checklist is completed before handoff.
