# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: A capsule explicitly declares a generator, its provenance and permitted output
  paths using the contract's syntax; malformed declarations fail with a named reason.
- AC-2: The approved generator runs against a disposable base workspace outside the live
  project, and its generated paths are compared to the candidate. Candidate idempotency alone
  never satisfies reproduction.
- AC-3: Unreproduced generated-path changes and unexpected writes are errors, with differing
  paths named. Non-generated changes remain subject to ordinary review.
- AC-4: Foreign-capsule exceptions apply only to explicitly authorized output paths whose
  delta is reproduced exactly; every other foreign capsule path remains fail-closed.
- AC-5: No bootstrap, dependency preparation or generator command runs without the
  existing operator approval guarantees. Headless approval covers the exact ordered command list.
- AC-6: Reproduction never writes to the live project and never mutates the canonical snapshot.
- AC-7: The TASK-075 migration is replayed using the specified generator provenance and
  bootstrap procedure, acknowledging that the migration command was absent from the historical
  base. Generated paths reproduce exactly; generator code receives separate semantic review.
- AC-8: The shipped contract README states what reproduction proves and what it does not,
  including that this is process isolation and not an OS sandbox.
- AC-9: Existing agent instruction files are preserved unless a human approves a merge.
- AC-10: The review checklist is completed before handoff.
- AC-11: Tests cover a generator introduced in the candidate, rejected bootstrap authorization,
  an extra foreign path and an idempotent command that does not reproduce the base-to-candidate delta.
