# Plan

## Workflow

SDD+TDD.

Reason: this changes two contracts at once. The capsule format gains a proof declaration, and
declared command evidence gains a necessary binding condition, so the specification must exist before code
(SDD). The parser and the binding rule are pure decision logic with many edges, so tests pin
them first (TDD). `workflowRules.apiOrContract` maps to SDD+TDD. The risk that justifies the
ceremony is concrete: a binding proof that is wrong blocks a correct implementation.

## Steps

1. Resolve declaration syntax and the distinction between claimed and observed evidence.
2. Complete the optional command/documentary-reference contract before implementation.
3. Write failing tests for parsing, unsupported references, policy-blocked references, unmet
   command requirements and declarations that are present but insufficient.
4. Implement parsing and verification without a new execution channel or record schema.
5. Update shipped templates and regenerate through the CLI; TASK-079 must first provide a
   supported upgrade path for capsule templates.
6. Exercise declarations on suitable criteria in this capsule without fabricating proofs.
