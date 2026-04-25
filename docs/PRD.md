# PRD — ContextForge v0.1

## Goal

Build a local CLI that installs and manages a ContextForge harness for AI coding agents.

## Primary outcomes

A developer can:

1. Run `contextforge init`.
2. Let ContextForge detect or ask which agent they use.
3. Install the correct harness for that agent.
4. Preserve any existing instructions.
5. Open their chosen agent and have it follow ContextForge methodology.
6. Create task capsules and agent-specific briefs.
7. Run doctor to audit and improve the setup.

## v0.1 scope

### Commands

```bash
contextforge init
contextforge doctor
contextforge task <description>
contextforge compile <taskId>
```

### Targets

```txt
codex
claude
copilot
pi
all
```

### Generated neutral structure

```txt
.contextforge/
  config.json
  policy.json
  wiki/
  tasks/
  targets/
```

### Generated Codex harness

```txt
AGENTS.md or AGENTS.contextforge.suggested.md
.agents/skills/contextforge-init/SKILL.md
.agents/skills/contextforge-doctor/SKILL.md
.agents/skills/contextforge-task/SKILL.md
.agents/skills/contextforge-review/SKILL.md
```

### Generated Claude harness

```txt
CLAUDE.md or CLAUDE.contextforge.suggested.md
.claude/commands/contextforge-doctor.md
.claude/commands/contextforge-task.md
```

### Generated Copilot harness

```txt
.github/copilot-instructions.md or .github/copilot-instructions.contextforge.suggested.md
.github/instructions/contextforge.instructions.md
.github/prompts/contextforge-doctor.prompt.md
.github/prompts/contextforge-task.prompt.md
```

### Generated Pi harness

```txt
.pi/prompts/contextforge-doctor.md
.pi/prompts/contextforge-task.md
.pi/skills/contextforge/SKILL.md
```

## Non-goals

- No web app.
- No SaaS.
- No LLM API integration.
- No telemetry.
- No external agent execution in v0.1.
- No application feature implementation by the ContextForge CLI.
- No automatic rewriting of existing agent files.

## Acceptance criteria

### Init

- Detects existing agent setup.
- Asks for target when needed.
- Creates `.contextforge/`.
- Creates target harness files.
- Does not overwrite existing files.
- Reports conflicts and suggested files.

### Doctor

- Checks whether ContextForge is installed.
- Checks which targets exist.
- Checks missing files.
- Checks existing instruction conflicts/gaps.
- Produces a readiness report.
- In Codex harness mode, the generated skill tells Codex how to perform a deeper intelligent review.

### Task

- Creates a task capsule.
- Uses simple deterministic workflow recommendation.
- Creates target export stubs.

### Compile

- Generates agent-specific task brief from the task capsule.
