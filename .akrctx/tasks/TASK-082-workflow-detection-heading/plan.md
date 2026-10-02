# Plan

## Workflow

TDD.

Reason: this reader defect has a known outcome, with precedence recorded in task.md. The capsule
format already exists in three observed shapes. Tests pin those shapes and the precedence rule
before the reader is changed. `workflowRules.bugfix` maps to TDD; this stays a focused bugfix.

## Steps

1. Write failing tests for plan prose/bullets, terminal punctuation, legacy fallback, conflicting
   values, an empty plan section, unknown values, UI review and no declaration.
2. Implement the read-only extraction and recorded precedence without returning a reason.
3. Check every capsule in the implementation-time corpus and report unsupported shapes.
4. Verify unchanged JSON shape and absence of reader writes or capsule migrations.
