# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: A criterion can carry indented proof-command: and proof-doc: lines. Multiple references
  are supported; declarations remain optional and duplicate identical references are deduplicated.
  proof-command: pnpm test
- AC-2: readAcceptanceCriteria extracts declarations before prose folding. Empty, orphaned,
  generic proof:, unsupported proof-prefixed fields and invalid path references report file/line
  defects without reading blocked targets.
  proof-command: pnpm test
- AC-3: Command references are checked against declared validation commands and their
  evidence under the existing trust rules. Documentary references are inspected as content;
  file existence alone never satisfies a criterion.
- AC-4: An unmet declared command requirement prevents the criterion passing; the reason
  names the AC identifier and the unmet requirement. A passing command cannot force a positive
  semantic judgment.
  proof-command: pnpm test
- AC-5: Verify distinguishes `proof requirement unmet`, `execution not observed: command accepted
  on trust`, and `criterion not evaluated` through current reasons/notices. Multiple relevant
  reasons may coexist; no declaration by itself requires new runtime observation.
  proof-command: pnpm test
- AC-6: Existing capsules remain valid without declared proofs, and no migration edits their prose.
- AC-7: The shipped judge instructions, the review JSON Schema and the contract README describe
  how a declared proof constrains the verdict.
  proof-doc: .akrctx/judge/README.md#Declared proof
- AC-8: The capsule template and `akrctx task` show the proof syntax.
  proof-doc: .akrctx/tasks/_template/acceptance-criteria.md
- AC-9: This capsule exercises the supported declaration kinds for appropriate criteria;
  criteria requiring judgment remain expressible without an artificial executable proof.
- AC-10: Existing agent instruction files are preserved unless a human approves a merge.
- AC-11: The review checklist is completed before handoff.
  proof-doc: .akrctx/tasks/TASK-077-criterion-proof-declarations/review-checklist.md
- AC-12: A passing but insufficient command and an existing but irrelevant document do not
  force `pass`; tests cover proof availability separately from criterion satisfaction.
  proof-command: pnpm test
- AC-13: No per-test result is inferred from free-form reporter output, and no new command
  executes because it appeared in a proof declaration.
  proof-command: pnpm test
- AC-14: Multiple command references are conjunctive. A globally optional command explicitly
  required by a criterion must have passing evidence for that criterion to pass.
  proof-command: pnpm test
- AC-15: Missing documentary targets are reported as unavailable without an automatic semantic
  verdict; remote or blocked targets are never fetched. Retired identifiers remain non-criteria.
  proof-command: pnpm test
