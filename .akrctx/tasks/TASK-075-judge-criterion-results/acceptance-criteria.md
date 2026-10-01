# Acceptance Criteria

- AC-1: Every top-level bullet in a capsule's `acceptance-criteria.md` starts with `AC-<n>: `.
  A missing, malformed, or duplicate identifier fails validation, and the error names the
  offending file line.
- AC-2: The judge references a criterion by its `AC-<n>` identifier, never by position.
- AC-3: `akrctx task migrate-criteria` adds identifiers to existing capsules without human
  editing. It supports one task ID or every capsule, and it supports `--dry-run`.
- AC-4: The review record carries `criteria[]` with one entry per declared `AC-<n>`. Each
  entry has `id`, `status` and a non-empty `evidence` string. A record with an `issues`
  property is invalid.
- AC-5: `APPROVED` requires every entry in `criteria[]` to carry `status: "pass"`. A missing
  or extra `AC-<n>` fails validation, and the error names it.
- AC-6: `observations[]` reports defects outside the declared criteria. A non-empty
  `observations[]` never blocks `APPROVED`.
- AC-7: `JUDGE_SCHEMA_VERSION` is 6. `akrctx judge verify` accepts a stored version 5 record
  under the version 5 rules and marks it legacy in its output.
- AC-8: The CLI never emits a version 5 record.
- AC-9: The shipped judge agent instructions, the shipped review JSON Schema, and the shipped
  contract README describe `criteria[]` and `observations[]` instead of `issues`.
- AC-10: The capsule template and `akrctx task` create acceptance criteria that already carry
  `AC-<n>` identifiers.
- AC-11: Existing agent instruction files are preserved unless a human approves a merge.
- AC-12: The review checklist is completed before handoff.
- AC-13: The historical round-count baseline from the records in `.akrctx/local/judge/` is
  measured and recorded in the implementation log. Rounds to APPROVED for later tasks are
  compared against that baseline.
