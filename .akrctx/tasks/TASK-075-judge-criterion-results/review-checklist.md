# Review Checklist

- [x] Contract recorded in task.md before implementation.
- [x] Acceptance criteria carry `AC-<n>` identifiers and match the contract.
- [x] Red tests written before implementation for criterion parsing, record shape, the
      APPROVED rule, and the legacy version 5 path.
- [x] `JUDGE_SCHEMA_VERSION` is 6; the CLI emits no version 5 record.
- [x] `criteria[]` is the only blocking channel; `observations[]` never blocks.
- [x] The 74 existing capsules migrated mechanically; no capsule hand-edited.
- [x] Shipped harness files regenerated from src/templates, not hand-edited.
- [x] Protected root instructions unchanged, or changed only after an approved exact diff.
- [x] Round-count baseline measured and recorded in the implementation log.
- [x] Build, full tests, lint and required CLI checks run.
- [x] Checklist completed before any snapshot capture, per TASK-051.
- [x] Capsule ready for independent review; invocation requires user confirmation.
