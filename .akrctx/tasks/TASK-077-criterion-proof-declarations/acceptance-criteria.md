# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: A criterion can declare its proof in `acceptance-criteria.md`, using the syntax the
  contract defines. A criterion with no declared proof stays valid.
- AC-2: `readAcceptanceCriteria` reports each criterion's declared proof, and a malformed
  declaration fails validation with the offending file line named.
- AC-3: Command references are checked against declared validation commands and their
  evidence under the existing trust rules. Documentary references are inspected as content;
  file existence alone never satisfies a criterion.
- AC-4: An unmet declared command requirement prevents the criterion passing; the reason
  names the AC identifier and the unmet requirement. A passing command cannot force a positive
  semantic judgment.
- AC-5: An unmet declared requirement is distinguished from missing runtime observation
  and from `not-evaluated`. A criterion without a proof declaration remains assessable.
- AC-6: Existing capsules remain valid without declared proofs, and no migration edits their prose.
- AC-7: The shipped judge instructions, the review JSON Schema and the contract README describe
  how a declared proof constrains the verdict.
- AC-8: The capsule template and `akrctx task` show the proof syntax.
- AC-9: This capsule exercises the supported declaration kinds for appropriate criteria;
  criteria requiring judgment remain expressible without an artificial executable proof.
- AC-10: Existing agent instruction files are preserved unless a human approves a merge.
- AC-11: The review checklist is completed before handoff.
- AC-12: A passing but insufficient command and an existing but irrelevant document do not
  force `pass`; tests cover proof availability separately from criterion satisfaction.
- AC-13: No per-test result is inferred from free-form reporter output, and no new command
  executes because it appeared in a proof declaration.
