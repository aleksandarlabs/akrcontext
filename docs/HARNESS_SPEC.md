# Harness Specification

## What is a harness?

A harness is the set of files that make an agent understand akrctx.

For Codex, the harness is:

```txt
AGENTS.md
.agents/skills/akrctx-*/SKILL.md
.akrctx/
```

For Claude:

```txt
CLAUDE.md
.claude/commands/
.akrctx/
```

For Copilot:

```txt
.github/copilot-instructions.md
.github/instructions/
.github/prompts/
.akrctx/
```

For Pi:

```txt
.pi/prompts/
.pi/skills/
.akrctx/
```

## Important distinction

The CLI does not need to understand the full project like a senior architect.

The selected agent does that after the harness is installed.

The CLI must install high-quality instructions and structure.

## Agent-level workflows

The installed harness must teach the agent these workflows:

### akrctx Doctor

Purpose:

- inspect current agent instructions
- inspect project structure
- update `.akrctx/wiki/`
- lint `.akrctx/wiki/` for broken links, orphan pages, and invalid frontmatter
- identify missing docs/rules
- detect contradictions
- recommend improvements
- not overwrite files without approval

### akrctx Task

Purpose:

- convert a user task into a task capsule
- recommend workflow
- identify relevant files
- define acceptance criteria
- define quality gates
- prepare implementation brief

### akrctx Research

Purpose:

- collect local project context
- optionally prepare web/documentation research questions
- update wiki
- avoid implementation until context is ready

### akrctx Review

Purpose:

- review whether a task capsule is ready for implementation
- verify test strategy
- verify scope boundaries
- verify security/sensitive files are excluded

## CLI-level workflows

The CLI itself is deterministic.

It installs the harness, creates files, and prevents unsafe overwrites.

It may also generate basic task skeletons, but the intelligent enrichment is done by the user's agent once the harness is active.

## Suggested user mental model

```txt
akrctx init       -> install the boss
open Codex/Claude/etc   -> the chosen agent now follows the boss
akrctx doctor     -> local check, plus agent workflow instructions
akrctx task       -> create/compile a task capsule
```
