# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: A capsule whose identifiers are unique and valid is never rewritten, including one with a
  gap left by a retired identifier.
- AC-2: `migrate-criteria --dry-run` reports no planned change for TASK-076, TASK-078 and
  TASK-081, and no change for any of the other capsules.
- AC-3: An unnumbered bullet still receives an identifier, and the identifier is one no criterion
  in that capsule has held.
- AC-4: A duplicate identifier is handled exactly as the contract decides, and the outcome is
  reported rather than applied silently.
- AC-5: No existing criterion identifier changes its meaning anywhere in the repository as a
  result of this delivery.
- AC-6: The existing `migrate-criteria` tests are corrected where they pinned the unconditional
  renumbering, and the correction is explained in the test or its comment.
- AC-7: `readAcceptanceCriteria` and the migration command agree on whether a given file needs
  repair.
- AC-8: Existing agent instruction files are preserved unless a human approves a merge.
- AC-9: The review checklist is completed before handoff.
