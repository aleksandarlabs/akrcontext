# Context

## Relevant Files

- `src/templates/judge.ts:69` — the defect. The closing paragraph of `judgeInstructions` names
  top-level keys and stops. This is the line the task replaces.
- `src/templates/judge-contract.ts` — generates `review.schema.json` from a literal object.
  `JUDGE_SCHEMA_VERSION` is imported here at line 1 and used at lines 14 and 34, and
  `JUDGE_SCHEMA_ID` is derived from it. The example must import the same constant, from the same
  place, for the interpolation criterion to mean anything.
- `src/judge-enforcement.ts` — `JUDGE_SCHEMA_VERSION = 2` at line 13. `validateRecord` at line
  440 is the function that produced the two rejection messages; `isTestRecord` and `isScope` are
  its helpers. All three are currently module-private.
- `tests/agent-templates.test.ts` — created by TASK-020, already asserts distinctive substrings
  across all six agent renderings. The new rendering assertion belongs here.
- `.claude/agents/akrctx-judge.md`, `.codex/agents/akrctx-judge.toml` — generated artifacts of
  the dogfooded install. Regenerate, never hand-edit.
- `.akrctx/judge/schemas/review.schema.json` — the generated schema. Read-only for this task.
- `.akrctx/local/judge/TASK-020-review-01.json` — the record that triggered this task. It is the
  hand-corrected version; the original defect was `schemaVersion: 1` and `notes` instead of
  `evidence`.

## Prior Findings

- The exact failure, from the TASK-020 review:

  ```
  Judge verification: INVALID
    - schemaVersion must be 2.
    - tests contains an invalid entry.
  ```

- `validateRecord` rejects unknown top-level keys outright (`Unexpected review field: <key>`),
  mirroring the schema's `additionalProperties: false`. `isTestRecord` enforces the same
  closedness inside a `tests` entry, which is why `notes` failed rather than being ignored.
- The schema requires `schemaVersion` twice: once at the top level and once inside `scope`, both
  `const: JUDGE_SCHEMA_VERSION`. An example that shows only the outer one is incomplete.
- `scope` has twelve required fields with pattern constraints on five of them. The judge is told
  to copy `akrctx judge scope --json` output verbatim into it, so the example needs to preserve
  that instruction rather than invite the agent to type the object by hand.
- The record shape is defined twice already — `validateRecord` by hand and `review.schema.json`
  by generation — with no mechanical link between them. This task adds a third definition. That
  is pre-existing debt this task does not resolve; it is recorded as an Open Question in task.md.
- `src/templates/comprehension-agent.ts:36` has the same defect in a worse form across three
  schemas. Deliberately out of scope; recorded as an Open Question.
- The judge is read-only by contract, so it cannot save or fix its own record. That is why an
  invalid record lands on the trusted caller as a temptation to edit the reviewer's output, and
  why this bug matters beyond the wasted round.

## Blocked Reads

- Secrets and credentials must not be read: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`,
  `*.pfx`, `secrets/`, `credentials/`, `private/`.
- `.akrctx/local/judge/snapshots/` holds full copies of earlier worktrees. Do not read `src/*.ts`
  under a snapshot path as current source; it is an old revision.
