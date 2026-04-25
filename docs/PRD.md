# PRD — akrctx v0.1

## Goal

Build a local CLI that installs and manages a akrctx harness for AI coding agents.

## Primary outcomes

A developer can:

1. Run `akrctx init`.
2. Let akrctx detect or ask which agent they use.
3. Install the correct harness for that agent.
4. Preserve any existing instructions.
5. Open their chosen agent and have it follow akrctx methodology.
6. Create task capsules and agent-specific briefs.
7. Run doctor to audit and improve the setup.

## v0.1 scope

### Commands

```bash
akrctx init
akrctx doctor
akrctx task <description>
akrctx compile <taskId>
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
.akrctx/
  config.json
  policy.json
  wiki/
  tasks/
  targets/
```

### Generated Codex harness

```txt
AGENTS.md or AGENTS.akrctx.suggested.md
.agents/skills/akrctx-init/SKILL.md
.agents/skills/akrctx-doctor/SKILL.md
.agents/skills/akrctx-task/SKILL.md
.agents/skills/akrctx-review/SKILL.md
```

### Generated Claude harness

```txt
CLAUDE.md or CLAUDE.akrctx.suggested.md
.claude/commands/akrctx-doctor.md
.claude/commands/akrctx-task.md
```

### Generated Copilot harness

```txt
.github/copilot-instructions.md or .github/copilot-instructions.akrctx.suggested.md
.github/instructions/akrctx.instructions.md
.github/prompts/akrctx-doctor.prompt.md
.github/prompts/akrctx-task.prompt.md
```

### Generated Pi harness

```txt
.pi/prompts/akrctx-doctor.md
.pi/prompts/akrctx-task.md
.pi/skills/akrctx/SKILL.md
```

## Non-goals

- No web app.
- No SaaS.
- No LLM API integration.
- No telemetry.
- No external agent execution in v0.1.
- No application feature implementation by the akrctx CLI.
- No automatic rewriting of existing agent files.

## Acceptance criteria

### Init

- Detects existing agent setup.
- Asks for target when needed.
- Creates `.akrctx/`.
- Creates target harness files.
- Does not overwrite existing files.
- Reports conflicts and suggested files.

### Doctor

- Checks whether akrctx is installed.
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
