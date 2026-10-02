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
- AC-4: One round is defined in task.md under `## Contract`, and the implementation applies
  exactly that rule. Duplicate copies of one review count once.
- AC-6: The command is strictly read-only: no filing, report write, network call, rename or deletion.
- AC-7: Records stay local. Nothing in `.akrctx/local/` becomes tracked.
- AC-8: The baseline the command reports for the existing records is recorded in the
  implementation log next to the 2.23 figure, and any difference is explained.
- AC-9: Existing agent instruction files are preserved unless a human approves a merge.
- AC-10: The review checklist is completed before handoff.
- AC-11: Catch-up reviews count as review work and are reported separately; records without
  enough category evidence are labelled unknown rather than inferred from their names.
- AC-12: The frozen 2.23 baseline is labelled with its source rule; recalculated statistics
  distinguish historically completed, still-open and ambiguous tasks.
