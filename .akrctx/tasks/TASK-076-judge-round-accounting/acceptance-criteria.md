# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: `akrctx judge rounds` reports rounds per task, mean and maximum for historically
  completed tasks, and separate totals for tasks still awaiting approval. `--json` exposes the
  same facts using the contract's structure.
- AC-2: `akrctx judge rounds TASK-ID` reports one task, including each round's verdict and
  review date.
- AC-3: The reader tolerates every record name shape present in `.akrctx/local/judge/`,
  including bare digests, dated names, per-task directories and the `records/` subdirectory.
  An unreadable or non-record file is skipped and reported, never counted.
- AC-4: Round identity is the parsed UTC reviewedAt instant plus scopeDigest within a task.
  Duplicate copies count once. Conflicting verdict, independence or supplied criterion statuses
  count once as ambiguous and name all source files.
- AC-6: The command is strictly read-only: no filing, report write, network call, rename or deletion.
- AC-7: Records stay local. Nothing in `.akrctx/local/` becomes tracked.
- AC-8: The baseline the command reports for the existing records is recorded in the
  implementation log next to the 2.23 figure, and any difference is explained.
- AC-9: Existing agent instruction files are preserved unless a human approves a merge.
- AC-10: The review checklist is completed before handoff.
- AC-11: Catch-up reviews count as review work and are reported separately; records without
  enough category evidence are labelled unknown rather than inferred from their names.
- AC-12: The implementation log compares the labelled 2.23 historical baseline to recalculated
  results. The generic CLI distinguishes closed/open/unknown tasks without a hardcoded baseline.
- AC-14: JSON has exactly tasks, closed, open, unknown and skipped with the contract's nested
  fields; human output exposes the same information. Empty mean/max values are null.
- AC-15: A file that is malformed or lacks a valid taskId or verdict is skipped with a reason.
  A recognizable record missing reviewedAt or scopeDigest is reported in unknown, is not counted
  as a round, and makes its task state unknown. Incomplete category evidence alone does not
  discard a round whose key is complete.

Retired: AC-5
Retired: AC-13
