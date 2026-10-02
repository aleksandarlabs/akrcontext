# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: A fenced JSON Migration declaration has generator (command, commit, review, inputs, prepare)
  and exact output paths. Malformed/unsafe/unsupported declarations fail with named reasons.
- AC-2: The approved generator runs against a disposable base workspace outside the live
  project, and its generated paths are compared to the candidate. Candidate idempotency alone
  never satisfies reproduction.
- AC-3: Unreproduced generated-path changes and unexpected writes are errors, with differing
  paths named. Non-generated changes remain subject to ordinary review.
- AC-4: Capture retains explicit --include-task authorization for every foreign capsule.
  Neither the declaration nor successful reproduction bypasses ordinary scope authorization.
- AC-5: No bootstrap, dependency preparation or generator command runs without the
  existing operator approval guarantees. Headless approval covers the exact ordered command list.
- AC-6: Reproduction never writes to the live project and never mutates the canonical snapshot.
- AC-7: TASK-075 is replayed as a two-step fixture with its previously reviewed generator in the
  mechanical base. Generated paths reproduce exactly; this is labelled an adapted reproduction,
  not execution of that command in its original historical base.
- AC-8: The shipped contract README states what reproduction proves and what it does not,
  including that this is process isolation and not an OS sandbox.
- AC-9: Existing agent instruction files are preserved unless a human approves a merge.
- AC-10: The review checklist is completed before handoff.
- AC-11: Tests reject candidate-created/modified generators, missing or mismatched prior review,
  denied preparation commands, unauthorized foreign paths and idempotency-only evidence.
- AC-12: Comparison covers byte content, additions/deletions, file type, executable bit and
  symlink targets. Detected out-of-path reproduction writes, including ignored outputs and
  observable write-then-restore, fail with named paths.
- AC-13: Tool preparation uses reviewed base inputs in a separate disposable tool workspace;
  the complete exact command list is approved before any shell command runs.
