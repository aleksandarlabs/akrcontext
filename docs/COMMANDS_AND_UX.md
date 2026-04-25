# Commands and UX

## `contextforge init`

### Flow

```txt
1. scan current directory
2. detect agent setup
3. choose target
4. create .contextforge/
5. install target harness
6. preserve existing files
7. report what happened
```

### Example

```bash
contextforge init
```

If no target found:

```txt
No agentic structure detected.
Which agent will this project use?

> Codex
  Claude Code
  GitHub Copilot
  Pi
  All
```

If Codex selected:

```txt
Installing ContextForge Codex harness...

Created:
+ .contextforge/config.json
+ .contextforge/policy.json
+ .contextforge/wiki/overview.md
+ .agents/skills/contextforge-doctor/SKILL.md
+ .agents/skills/contextforge-task/SKILL.md
+ AGENTS.md

Next:
Open Codex in this repo and ask:
"Run ContextForge doctor."
```

If `AGENTS.md` exists:

```txt
Found existing AGENTS.md.
Preserving it.

Created:
+ AGENTS.contextforge.suggested.md
+ .contextforge/wiki/agent-setup.md

Next:
Open Codex and ask:
"Run ContextForge doctor and compare AGENTS.md with AGENTS.contextforge.suggested.md. Propose a safe merge."
```

## `contextforge doctor`

Local deterministic doctor.

It reports:

- installed targets
- missing ContextForge files
- existing instruction files
- conflicts
- readiness score
- next agent prompt

It should also print a suggested agent prompt:

```txt
Suggested Codex prompt:
Run ContextForge doctor. Inspect this repo's agent instructions and .contextforge wiki. Do not modify source code. Update only .contextforge/wiki and propose instruction merges.
```

## `contextforge task`

Creates a task capsule.

```bash
contextforge task "Create settings screen with tabs and tests"
```

Creates:

```txt
.contextforge/tasks/TASK-001-create-settings-screen-with-tabs-and-tests/
  task.md
  context.md
  plan.md
  review-checklist.md
  exports/
```

Then tells user:

```txt
Open your agent and ask:
Run ContextForge task workflow for TASK-001.
```

## `contextforge compile`

Generates an agent-specific implementation/research brief.

```bash
contextforge compile TASK-001 --target codex
```
