# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: New generated checklists separate Evidence References from Process Attestations
  with plain Markdown headings; existing unclassified checklists remain valid.
- AC-4: Checklist layout introduces no verification gate and changes neither `valid` nor `approved`.
- AC-5: TASK-051's decision about `review-checklist.md` is preserved, and the delivery states how.
- AC-6: Existing capsules stay valid with mixed or unclassified checklists and are not migrated.
- AC-7: Both shipped checklist producers use the same evidence-reference and
  actor-labelled attestation distinction, without adding a runtime parser.
- AC-8: Existing agent instruction files are preserved unless a human approves a merge.
- AC-9: This capsule's checklist follows the distinction and is completed before snapshot
  capture; no item requires a post-approval write inside the reviewed capsule.
- AC-10: Template attestations identify the asserting actor and state that a checked box is
  self-reported, not independent verification or authenticated human approval.
- AC-11: The templates refer mechanical outcomes to existing criteria or validation evidence
  instead of requiring a duplicate set of mechanically graded checkboxes.

Retired: AC-2
Retired: AC-3
