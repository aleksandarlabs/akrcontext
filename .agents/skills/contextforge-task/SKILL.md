---
name: contextforge-task
description: Use when turning a development task into a ContextForge task capsule before implementation. Trigger on "contextforge task", "prepare task", "create task capsule".
---

# ContextForge Task Skill

You prepare a task for implementation by another agent or later session.

## Job

Convert the user request into a task capsule.

## Required output

Create or update:

```txt
.contextforge/tasks/TASK-XXX-slug/
  task.md
  context.md
  plan.md
  acceptance-criteria.md
  review-checklist.md
  exports/
```

## Method

1. Clarify goal.
2. Recommend workflow:
   - research-first
   - SDD
   - TDD
   - UI review
   - fast patch
3. Identify relevant files to inspect.
4. Define out-of-scope.
5. Define acceptance criteria.
6. Define validation commands.
7. Prepare agent-specific brief.

## Important

If the task is ambiguous, write open questions in the task capsule instead of inventing details.


## Universal rules

- Do not modify application source code.
- Do not overwrite existing instructions.
- Prefer `.contextforge/` updates and suggested merge files.
- Ask before changing existing agent instruction files.
- Treat secrets and credentials as blocked.
