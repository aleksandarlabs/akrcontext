# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

- AC-1: For the explicitly supported existing-capsule cases, verify emits a heuristic
  notice when compared contract or criteria text changes without new clarification content or
  an explicit no-ambiguity explanation. It never states that consultation was proven absent.
- AC-2: The notice states that it is a heuristic and names what it compared.
- AC-3: The notice never blocks. `valid` and `approved` are unchanged by it.
- AC-4: The contract enumerates supported silent cases and known detection limits.
  Capsules predating clarification sections and newly introduced capsules do not trigger the
  missing-clarification notice; prose edits are ignored only by specified syntactic rules.
- AC-6: New clarification content or the contract's explicit no-ambiguity explanation
  suppresses the notice; a session heading or date alone is not evidence of new clarification.
- AC-7: The comparison reads the base from the reviewed boundary, never from the live workspace.
- AC-8: Protected root instructions are unchanged, or changed only after an approved exact diff.
- AC-9: Existing agent instruction files are preserved unless a human approves a merge.
- AC-10: The review checklist is completed before handoff.
- AC-11: Replaying TASK-075's first-added capsule does not emit a missing-consultation notice;
  the example is documented as inconclusive because contract and clarifications appear together.
