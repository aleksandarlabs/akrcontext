# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: Every approved human-readable header says `APPROVED for the reviewed boundary`;
  live workspace applicability is presented separately and never implied by the approval label.
- AC-2: Tests pin the separate label for CURRENT, NEWER_CHANGES, DIVERGED and null.
  Null renders `not classified for this boundary type`, never CURRENT.
- AC-3: The JSON output shape is unchanged.
- AC-4: No verdict changes. A record approved before this change is approved after it.
- AC-5: Replaying the observed record from this capsule's problem evidence produces a header a
  reader cannot misread as "matches my working tree".
- AC-6: Existing agent instruction files are preserved unless a human approves a merge.
- AC-7: The review checklist is completed before handoff.
