# Plan

## Workflow

SDD+TDD.

Reason: this changes two contracts at once. The capsule format gains a proof declaration, and
declared command evidence gains a necessary binding condition, so the specification must exist before code
(SDD). The parser and the binding rule are pure decision logic with many edges, so tests pin
them first (TDD). `workflowRules.apiOrContract` maps to SDD+TDD. The risk that justifies the
ceremony is concrete: a binding proof that is wrong blocks a correct implementation.

## Steps

1. Use the closed declaration contract; coordinate shared criterion parsing with TASK-084.
2. Write failing tests for physical-line parsing, duplicate references, orphaned/unsupported
   declarations, blocked paths, multiple commands and globally optional proof commands.
3. Pin separate unmet-proof, unobserved-execution and not-evaluated messages using current
   record and result structures. Keep documentary judgment distinct from mechanical status.
4. Implement parser/verification changes without new execution or reporter-text inference.
5. After TASK-079, update and regenerate shipped templates through the CLI.
6. Exercise appropriate declarations in this capsule; do not fabricate proofs for judgment.
