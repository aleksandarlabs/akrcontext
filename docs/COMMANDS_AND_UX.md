# Commands and UX

## `akrctx init`

### Flow

```txt
1. scan current directory
2. detect agent setup
3. choose target
4. create .akrctx/
5. install target harness
6. preserve existing files
7. report what happened
```

### Example

```bash
akrctx init
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
Installing akrctx Codex harness...

Created:
+ .akrctx/config.json
+ .akrctx/policy.json
+ .akrctx/wiki/overview.md
+ .agents/skills/akrctx-doctor/SKILL.md
+ .agents/skills/akrctx-task/SKILL.md
+ AGENTS.md

Next:
Open Codex in this repo and ask:
"Run akrctx doctor."
```

If `AGENTS.md` exists:

```txt
Found existing AGENTS.md.
Preserving it.

Created:
+ AGENTS.akrctx.suggested.md
+ .akrctx/wiki/agent-setup.md

Next:
Open Codex and ask:
"Run akrctx doctor and compare AGENTS.md with AGENTS.akrctx.suggested.md. Propose a safe merge."
```

## `akrctx doctor`

Local deterministic doctor.

It reports:

- installed targets
- missing akrctx files
- existing instruction files
- conflicts
- readiness score
- next agent prompt

It should also print a suggested agent prompt:

```txt
Suggested Codex prompt:
Run akrctx doctor. Inspect this repo's agent instructions and .akrctx wiki. Audit setup only; do not implement product features during doctor. Update .akrctx/wiki and propose instruction merges.
```

## `akrctx task`

Creates a task capsule.

```bash
akrctx task "Create settings screen with tabs and tests"
```

Creates:

```txt
.akrctx/tasks/TASK-001-create-settings-screen-with-tabs-and-tests/
  task.md
  context.md
  plan.md
  review-checklist.md
  exports/
```

Then tells user:

```txt
Open your agent and ask:
Run akrctx task workflow for TASK-001.
```

## `akrctx compile`

Generates an agent-specific implementation/research brief.

```bash
akrctx compile TASK-001 --target codex
```
