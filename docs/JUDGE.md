# Judge

The akrctx judge is an optional subagent that independently reviews whether an implementation matches the task capsule. It is separate from the primary coding agent, reconstructs the exact change boundary itself, and reads without modifying product code or Git state.

## How it works

After the primary agent finishes implementing a task, it offers the user the option to invoke the judge. The user confirms. The judge reads the task capsule (`task.md`, `acceptance-criteria.md`, `plan.md`) and the changed files, then reports:

- **APPROVED** — implementation matches the task capsule.
- **NEEDS CHANGES** — mostly correct but has specific gaps.
- **BLOCKED** — does not match the goal or has critical issues.

The judge reports its exact base/candidate boundary, validation evidence, and a compact structured review record. It does not implement its own feedback. If changes are needed, the user hands them back to the primary agent. An enabled comprehension evaluator should run only after `APPROVED` for the same boundary.

## Enabling the judge

```bash
akrctx judge enable
```

This sets `judge.enabled = true` in `.akrctx/config.json` and generates agent files for each installed target:

| Target | File |
|---|---|
| Claude Code | `.claude/agents/akrctx-judge.md` |
| GitHub Copilot | `.github/agents/akrctx-judge.agent.md` |
| Codex | `.codex/agents/akrctx-judge.toml` |
| Pi | Not supported — no native subagent API |

To preview what would be generated without writing files:

```bash
akrctx judge enable --dry-run
```

## Checking status

```bash
akrctx judge status
```

## Disabling the judge

```bash
akrctx judge disable
```

This sets `judge.enabled = false` in config. The agent files are kept — delete them manually if you no longer need them.

## Setting a model

The generated agent files do not specify a model. By default the judge inherits whatever model the platform selects. To use a specific model for the judge, edit the generated file and add the model field manually.

> Model identifiers are platform-specific and change over time. Always check your platform's current documentation — do not copy identifiers from examples here.

### Claude Code

Edit `.claude/agents/akrctx-judge.md` and add `model` to the frontmatter:

```yaml
---
name: akrctx-judge
description: ...
tools: Read, Glob, Grep, Bash
permissionMode: plan
model: <model-id>   ← add this line
---
```

Valid model values: a full model ID (`claude-opus-4-7-20251101`), a short alias (`opus`, `sonnet`, `haiku`), or `inherit` (explicit inherit from session). See [Claude Code subagent docs](https://code.claude.com/docs/en/sub-agents) for the current list.

### GitHub Copilot

Edit `.github/agents/akrctx-judge.agent.md` and add `model` to the frontmatter:

```yaml
---
name: akrctx Judge
description: ...
tools: ["read", "search", "execute"]
model: <model-id>   ← add this line
---
```

Copilot model identifiers use a display-name format that includes the provider label (e.g. `"GPT-5.4 (copilot)"`). The exact format is shown in the Copilot model picker inside VS Code or GitHub. See [Copilot custom agents docs](https://docs.github.com/en/copilot/reference/custom-agents-configuration) for details.

### Codex

Edit `.codex/agents/akrctx-judge.toml` and add a `model` field:

```toml
name = "akrctx-judge"
description = "..."
model = "<model-id>"   ← add this line
model_reasoning_effort = "high"
sandbox_mode = "read-only"
developer_instructions = "..."
```

See [Codex subagent docs](https://developers.openai.com/codex/subagents) for valid model identifiers.

## Pi

Pi does not have a native subagent API. The judge is not available for Pi targets. `akrctx judge enable` skips Pi automatically.
