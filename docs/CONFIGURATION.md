# Configuration

akrctx stores project defaults in:

```txt
.akrctx/config.json
```

The config is shared by the CLI and the installed agent harness.

## Show Config

```bash
akrctx config show
```

## Set Defaults

```bash
akrctx config set defaultWorkflow task-fit
akrctx config set defaultWorkflow SDD+TDD
akrctx config set defaultTarget codex
akrctx config set requireTaskCapsule true
akrctx config set requireWorkflowReason true
akrctx config set contextBudget proportional
```

## Workflow Default

Use `task-fit` for most projects. It tells the agent to choose the smallest suitable workflow for each task.

Use a concrete workflow when the whole project should bias toward that process unless a task overrides it.

```json
{
  "defaults": {
    "workflow": "task-fit",
    "requireTaskCapsule": true,
    "requireWorkflowReason": true,
    "contextBudget": "proportional"
  }
}
```

## Context Budget

- `minimal`: load only policy and current task capsule.
- `proportional`: load policy, current task capsule, and relevant wiki pages.
- `thorough`: allow broader wiki review for high-risk tasks.

Do not read all of `.akrctx/` by default.
