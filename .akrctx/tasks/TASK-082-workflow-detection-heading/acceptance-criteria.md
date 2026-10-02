# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: `akrctx task show` reports the workflow a capsule declares in `plan.md` under
  `## Workflow`, for both the prose shape and the bullet shape.
- AC-2: The legacy task.md heading remains a fallback. A non-empty plan.md declaration
  wins on disagreement; an empty plan section permits the legacy fallback.
- AC-3: A capsule that declares no workflow still reports an absent value, never a guess.
- AC-4: `task show --json` reports the declared workflow for each capsule in the
  implementation-time corpus that declares one, including punctuation and UI review examples.
- AC-5: The reader does not edit capsule files, and this delivery does not migrate other
  capsules or change generated headings. Maintenance of this task's own capsule remains permitted.
- AC-6: Existing agent instruction files are preserved unless a human approves a merge.
- AC-7: The review checklist is completed before handoff.
