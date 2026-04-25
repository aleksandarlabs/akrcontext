# Product Brief — ContextForge

## Short definition

ContextForge installs an agentic workflow harness into a software project so the chosen coding agent knows how to prepare enterprise-ready context before implementation.

## The user problem

A developer working with AI coding agents often asks:

- Should I use TDD, SDD, research-first, fast patch, or another workflow?
- Is my `.github/`, `AGENTS.md`, `CLAUDE.md` or Pi setup actually good?
- I have a new task. What exact context should the agent receive?
- My company moved from Copilot to Claude Code. How do I keep the same working system?
- How do I avoid leaking secrets or sending irrelevant code?

## The solution

ContextForge installs a neutral project layer:

```txt
.contextforge/
```

And target-specific harness files:

```txt
Codex       -> AGENTS.md + .agents/skills/
Claude Code -> CLAUDE.md + .claude/commands/
Copilot     -> .github/copilot-instructions.md + .github/instructions/ + .github/prompts/
Pi          -> .pi/prompts/ + .pi/skills/
```

## Core philosophy

ContextForge does not replace the coding agent.

It makes the chosen coding agent behave better.

```txt
ContextForge = method + structure + safety + task context + quality gates
Agent        = reasoning + codebase analysis + implementation
```

## Main flow

```bash
contextforge init
```

If no agent setup exists:

```txt
No agentic structure detected.
Which agent will this project use?
1. Codex
2. Claude Code
3. GitHub Copilot
4. Pi
```

If the user chooses Codex, ContextForge installs the Codex harness.

From that point, Codex opens the repo and is guided by the generated `AGENTS.md` and skills.

## Existing projects

If the project already has instructions, ContextForge must not overwrite them.

It adds missing structure and creates suggested files. Then `contextforge doctor` audits, normalizes and proposes improvements.
