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

## Comprehension Gate

The optional comprehension gate installs a separate learning evaluator that asks the developer code-specific questions after a significant completed change. It runs outside the implementing agent's context, may inspect Git with read-only commands, but never stages, commits, pushes, merges, resets, or otherwise changes Git state. It does not block merges or replace correctness review.

Enable it once for the project:

```bash
akrctx comprehension enable
akrctx comprehension status
akrctx comprehension disable
```

When enabled, the primary agent asks permission to invoke `akrctx-comprehension`. If the judge is enabled, the primary agent first offers the judge and waits for APPROVED on the same code boundary. The comprehension agent then independently reconstructs the change, skips surface-only work, renders a change map and test matrix, and conducts a short interactive checkpoint for meaningful logic, architecture, security, persistence, infrastructure, or other material risks.

The handoff is deliberately narrow: task ID, exact base/candidate boundary, and judge verdict. The implementing agent must not provide its explanations, proposed questions, expected answers, or conclusions. See [COMPREHENSION.md](COMPREHENSION.md) for the full protocol and platform differences.

Personal answers, hints, and results belong in `.akrctx/local/comprehension/TASK-XXX/<session-id>/`. The installed `.akrctx/local/.gitignore` keeps new records out of version control by default. Before persistence, the agent verifies the path with read-only Git commands; if it cannot verify this, it keeps the interaction in chat. Git ignore rules are not encryption and do not protect files from other local software or backups.

```json
{
  "comprehensionGate": {
    "enabled": false,
    "trigger": "agent-assessed-significance",
    "evaluationMode": "prefer-independent"
  }
}
```

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
  "installedVersion": "0.3.0",
  "profile": "default",
  "targets": ["codex"],
  "judge": {
    "enabled": false,
    "trigger": "post-implementation"
  },
  "comprehensionGate": {
    "enabled": false,
    "trigger": "agent-assessed-significance",
    "evaluationMode": "prefer-independent"
  },
  "defaults": {
    "workflow": "task-fit",
    "allowedWorkflows": ["fast-patch", "research-first", "SDD", "TDD", "EDD", "SDD+TDD", "SDD+EDD", "TDD+EDD"],
    "requireTaskCapsule": true,
    "requireWorkflowReason": true,
    "contextBudget": "proportional"
  },
  "workflowRules": {
    "default": "task-fit",
    "bugfix": "TDD",
    "apiOrContract": "SDD+TDD",
    "edgeCases": "SDD+EDD",
    "ui": "UI review",
    "smallSafePatch": "fast-patch",
    "unknownArea": "research-first"
  }
}
```
