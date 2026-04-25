# Target Adapter Spec

## Codex

### Main files

```txt
AGENTS.md
.agents/skills/
.akrctx/
```

### Why not only `.codex/`?

For Codex, `AGENTS.md` is the main project instruction file. `.codex/` is for project-scoped Codex configuration, hooks and advanced settings. Skills live under `.agents/skills/`.

So akrctx should use:

- `AGENTS.md` for core repo guidance
- `.agents/skills/` for reusable akrctx workflows
- `.akrctx/` for neutral source of truth
- `.codex/` only for optional Codex configuration later

### Generated skill folders

```txt
.agents/skills/akrctx-init/SKILL.md
.agents/skills/akrctx-doctor/SKILL.md
.agents/skills/akrctx-task/SKILL.md
.agents/skills/akrctx-review/SKILL.md
```

## Claude Code

### Main files

```txt
CLAUDE.md
.claude/commands/
.akrctx/
```

## GitHub Copilot

### Main files

```txt
.github/copilot-instructions.md
.github/instructions/akrctx.instructions.md
.github/prompts/akrctx-doctor.prompt.md
.github/prompts/akrctx-task.prompt.md
.akrctx/
```

## Pi

### Main files

```txt
.pi/prompts/akrctx-doctor.md
.pi/prompts/akrctx-task.md
.pi/skills/akrctx/SKILL.md
.akrctx/
```

## All targets

The source of truth is always `.akrctx/`.

Target files are adapters.
