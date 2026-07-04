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
akrctx config set allowedWorkflows SDD,TDD,fast-patch
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

## Allowed Workflows

`defaults.allowedWorkflows` restricts which workflows the agent (and the CLI `akrctx task`) may use. By default it includes every workflow.

```bash
akrctx config set allowedWorkflows SDD,TDD
akrctx config set allowedWorkflows "SDD+TDD, SDD+EDD, fast-patch"
```

Values are comma- or space-separated and normalized automatically. Invalid values are rejected.

Behavior:

- An explicit `--workflow` that is not allowed is rejected.
- A configured `defaultWorkflow` that is not allowed is rejected as a misconfiguration.
- When `task-fit` recommends a disallowed workflow, the CLI falls back to the first allowed workflow and records the reason in the task capsule.

```json
{
  "defaults": {
    "allowedWorkflows": ["SDD", "TDD", "fast-patch"]
  }
}
```

## Context Budget

- `minimal`: load only policy and current task capsule.
- `proportional`: load policy, current task capsule, and relevant wiki pages.
- `thorough`: allow broader wiki review for high-risk tasks.

Do not read all of `.akrctx/` by default.

---

## Profiles

Profiles are installation presets stored in `.akrctx/config.json` and `.akrctx/policy.json`.

```bash
akrctx init --target codex --profile default
akrctx init --target copilot --profile strict
akrctx init --target copilot --profile regulated
```

- `default`: standard akrctx behavior.
- `strict`: uses `contextBudget: thorough` and adds stricter blocked-read patterns.
- `regulated`: inherits strict policy, adds regulated-material blocked reads, and routes small safe patches to `TDD` instead of `fast-patch`.

Example config fields:

```json
{
  "profile": "regulated",
  "defaults": {
    "contextBudget": "thorough"
  },
  "workflowRules": {
    "smallSafePatch": "TDD",
    "default": "research-first"
  }
}
```

`akrctx doctor` validates profile-specific policy requirements.

---

## Judge

The judge is an optional subagent that independently reviews implementation against the task capsule. It is disabled by default.

```bash
akrctx judge enable   # install judge files and set enabled: true
akrctx judge disable  # set enabled: false (files are kept)
akrctx judge status   # show state
```

The enabled state is stored in config:

```json
{
  "judge": {
    "enabled": false,
    "trigger": "post-implementation"
  }
}
```

**Do not set `enabled: true` manually in `config.json`** without running `akrctx judge enable` first. If the judge is enabled but no agent files exist, `akrctx doctor` will detect the gap and prompt you to run `judge enable`.

Each platform's judge agent file is installed in the native subagent location for that target. No model is hardcoded — add your preferred model manually after installation. See [JUDGE.md](JUDGE.md) for per-platform instructions.

---

## Full config.json shape

```json
{
  "version": 1,
  "installedVersion": "0.1.0",
  "profile": "default",
  "targets": ["codex"],
  "judge": {
    "enabled": false,
    "trigger": "post-implementation"
  },
  "defaults": {
    "workflow": "task-fit",
    "allowedWorkflows": ["fast-patch", "research-first", "SDD", "TDD", "EDD", "SDD+TDD", "SDD+EDD", "TDD+EDD"],
    "requireTaskCapsule": true,
    "requireWorkflowReason": true,
    "contextBudget": "proportional"
  },
  "workflowRules": [
    { "match": "bug|fix|regression|hotfix", "workflow": "fast-patch" },
    { "match": "research|spike|explore|investigate", "workflow": "research-first" },
    { "match": "ui|screen|component|layout|design", "workflow": "UI review" }
  ]
}
```
