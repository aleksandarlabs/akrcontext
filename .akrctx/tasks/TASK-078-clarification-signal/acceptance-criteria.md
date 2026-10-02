# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: For the explicitly supported existing-capsule cases, verify emits a heuristic
  notice when compared contract or criteria text changes without new clarification content or
  an explicit no-ambiguity explanation. It never states that consultation was proven absent.
- AC-2: The heuristic notice identifies the affected section/file, raw added/deleted line counts
  and reviewed-boundary diff pointer, is capped at 1024 characters and contains no full diff.
- AC-3: The notice never blocks. `valid` and `approved` are unchanged by it.
- AC-4: Tests pin prose reflow and terminal-full-stop normalization, preserve operators/code/path
  punctuation and structured declaration lines, and document the enumerated detection limits.
  New capsules and missing historical clarification sections remain inconclusive.
- AC-6: A new non-placeholder top-level clarification bullet, including No ambiguity: with a
  non-empty explanation, suppresses the heuristic. Heading/date changes, duplicate bullets and
  an empty No ambiguity: do not.
- AC-7: The comparison reads the base from the reviewed boundary, never from the live workspace.
- AC-8: Protected root instructions are unchanged, or changed only after an approved exact diff.
- AC-9: Existing agent instruction files are preserved unless a human approves a merge.
- AC-10: The review checklist is completed before handoff.
- AC-11: Replaying TASK-075's first-added capsule does not emit a missing-consultation notice;
  the example is documented as inconclusive because contract and clarifications appear together.
- AC-12: Snapshot and commit-ref comparisons use readable reviewed base/candidate content;
  WORKTREE and unavailable comparison inputs report comparison unavailable without a live
  fallback or any change to valid/approved.

Retired: AC-5
