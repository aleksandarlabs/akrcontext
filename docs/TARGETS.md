# Target Adapter Spec

## Codex

### Main files

```txt
AGENTS.md
.agents/skills/
.contextforge/
```

### Why not only `.codex/`?

For Codex, `AGENTS.md` is the main project instruction file. `.codex/` is for project-scoped Codex configuration, hooks and advanced settings. Skills live under `.agents/skills/`.

So ContextForge should use:

- `AGENTS.md` for core repo guidance
- `.agents/skills/` for reusable ContextForge workflows
- `.contextforge/` for neutral source of truth
- `.codex/` only for optional Codex configuration later

### Generated skill folders

```txt
.agents/skills/contextforge-init/SKILL.md
.agents/skills/contextforge-doctor/SKILL.md
.agents/skills/contextforge-task/SKILL.md
.agents/skills/contextforge-review/SKILL.md
```

## Claude Code

### Main files

```txt
CLAUDE.md
.claude/commands/
.contextforge/
```

## GitHub Copilot

### Main files

```txt
.github/copilot-instructions.md
.github/instructions/contextforge.instructions.md
.github/prompts/contextforge-doctor.prompt.md
.github/prompts/contextforge-task.prompt.md
.contextforge/
```

## Pi

### Main files

```txt
.pi/prompts/contextforge-doctor.md
.pi/prompts/contextforge-task.md
.pi/skills/contextforge/SKILL.md
.contextforge/
```

## All targets

The source of truth is always `.contextforge/`.

Target files are adapters.
