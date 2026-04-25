# AGENTS.md - akrctx Harness

This repository is akrctx-aware. Treat `.akrctx/` as the project workflow source of truth.

## Mandatory Behavior

When the user asks to implement a feature, fix, refactor, or meaningful code change:

1. Read `.akrctx/config.json` and `.akrctx/policy.json`.
2. Create or update a task capsule under `.akrctx/tasks/TASK-XXX-.../` before implementation.
3. Record the chosen workflow and the reason in the capsule.
4. Follow the workflow from config unless the user explicitly overrides it.
5. Load only relevant context. Do not read all of `.akrctx/` by default.
6. After implementation, update the task review checklist and run relevant validation.

Create the task capsule yourself — do not ask the user to run `akrctx task`. The CLI task command is only a headless fallback for scripts and CI.

## Current Project Defaults

Read the live values from `.akrctx/config.json`. Important defaults may include:

- `defaults.workflow`
- `defaults.requireTaskCapsule`
- `defaults.requireWorkflowReason`
- `defaults.contextBudget`
- `workflowRules`

If `defaults.workflow` is `task-fit`, choose the smallest workflow that fits the task. If it is concrete, use it unless the user explicitly asks otherwise.

## akrctx Write Policy

Use these homes:

- Task capsules: `.akrctx/tasks/TASK-XXX-.../`
- Doctor findings: `.akrctx/wiki/`
- Compiled briefs: `.akrctx/tasks/TASK-XXX-.../exports/`
- Decisions: `.akrctx/wiki/decisions.md`
- Task implementation notes: `.akrctx/tasks/TASK-XXX-.../log.md`

Do not write durable workflow notes in random files.

## Safety

- Do not read secrets or credential files.
- Do not overwrite existing instruction files in target projects. Write suggested files on conflict.

## Contributor Notes

This repository builds akrctx, a local CLI that installs agent workflow harnesses into other projects.

Primary source files:

- `src/cli.ts` - command wiring.
- `src/init.ts` - harness installation.
- `src/doctor.ts` - deterministic setup audit.
- `src/task.ts` - task capsule generation.
- `src/compile.ts` - target brief generation.
- `src/config.ts` - project defaults and workflow config.
- `src/templates.ts` - generated harness content.
- `tests/akrctx.test.ts` - CLI core behavior.

Run before handoff:

```bash
pnpm build
pnpm test
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```
