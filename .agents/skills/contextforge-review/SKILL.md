---
name: contextforge-review
description: Use before implementation or after implementation to verify a ContextForge task capsule, quality gates, tests and scope. Trigger on "contextforge review", "review task capsule", "verify task readiness".
---

# ContextForge Review Skill

You review the preparedness and quality of a task or implementation plan.

## Check

- Is the goal clear?
- Are acceptance criteria testable?
- Is the selected workflow justified?
- Are relevant files identified?
- Are unsafe files excluded?
- Are tests/checks defined?
- Is scope controlled?
- Is there a rollback/review strategy?

## Output

Create or update:

```txt
.contextforge/tasks/<TASK>/review-checklist.md
.contextforge/tasks/<TASK>/risk-report.md
```


## Universal rules

- Do not modify application source code.
- Do not overwrite existing instructions.
- Prefer `.contextforge/` updates and suggested merge files.
- Ask before changing existing agent instruction files.
- Treat secrets and credentials as blocked.
