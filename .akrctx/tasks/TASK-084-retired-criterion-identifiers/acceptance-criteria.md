# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: A capsule whose identifiers are unique and valid is never rewritten, including one with a
  gap left by a retired identifier.
- AC-2: After explicit retirement metadata is recorded, migrate-criteria --dry-run reports
  changed: false for TASK-076, TASK-078 and TASK-081 and all already-numbered valid capsules
  in the implementation-time corpus; it performs no writes.
- AC-3: An unnumbered bullet receives the next integer above all active and explicitly retired
  identifiers after scanning the whole file. Allocation never fills gaps or alters valid IDs.
- AC-4: Duplicates, malformed identity metadata and active/retired overlap produce named
  file/line errors and no write to the affected capsule; a bulk run reports failure explicitly.
- AC-5: No existing criterion identifier changes its meaning anywhere in the repository as a
  result of this delivery.
- AC-6: The existing `migrate-criteria` tests are corrected where they pinned the unconditional
  renumbering, and the correction is explained in the test or its comment.
- AC-7: Reader and migrator agree on valid active/retired identifiers and on identity defects.
  Only unnumbered bullets are automatically repairable; retired IDs are not live criteria.
- AC-8: Existing agent instruction files are preserved unless a human approves a merge.
- AC-9: The review checklist is completed before handoff.
- AC-10: Footer lines `Retired: AC-<n>` reserve identifiers without becoming criteria or
  judge-result obligations. The known retirements in TASK-076, TASK-078 and TASK-081 are recorded.
- AC-11: A no-op returns changed: false and leaves bytes and mtime unchanged. A second pass
  after inserting missing IDs is also a no-op; dry-run reports the same planned allocation.
