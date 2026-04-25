# Write Policy

ContextForge keeps root instructions small and writes durable context only when it has a clear home.

## Where To Write

- Doctor findings: .contextforge/wiki/agent-setup.md, gaps.md, recommendations.md
- Task capsules: .contextforge/tasks/TASK-XXX/
- Compiled briefs: .contextforge/tasks/TASK-XXX/exports/<target>.md
- Architecture or process decisions: .contextforge/wiki/decisions.md
- Implementation notes for a task: .contextforge/tasks/TASK-XXX/log.md

## Context Budget

- Do not read all of .contextforge/ by default.
- Read policy.json first when safety or merge behavior matters.
- Read the current task capsule before implementation.
- Read only wiki pages that are relevant to the current task.
- Load target workflow skills or prompts only when the task calls for them.
