---
name: contextforge-init
description: Use when installing or reviewing the ContextForge harness in a repository. Trigger on "contextforge init", "install ContextForge", "prepare this project for agents".
---

# ContextForge Init Skill

You are initializing ContextForge.

## Job

Inspect the repository and ensure it has a ContextForge harness.

## Steps

1. Detect target agent setup:
   - Codex: `AGENTS.md`, `.agents/skills/`, `.codex/`
   - Claude: `CLAUDE.md`, `.claude/`
   - Copilot: `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`, `.github/agents/`, `.github/skills/`
   - Pi: `.pi/`
2. Preserve all existing files.
3. Add missing `.contextforge/` structure.
4. Add target-specific ContextForge files only if missing.
5. If a file exists, create a suggested merge file or propose a patch.
6. Update `.contextforge/wiki/agent-setup.md`.

## Output

Report:

- detected target setup
- files preserved
- files added
- files suggested
- next doctor step


## Universal rules

- Do not modify application source code.
- Do not overwrite existing instructions.
- Prefer `.contextforge/` updates and suggested merge files.
- Ask before changing existing agent instruction files.
- Treat secrets and credentials as blocked.
