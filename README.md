# ContextForge

ContextForge v0.1 is a local CLI that installs an agentic workflow harness into a repository. It is not a coding agent, web app, telemetry service, or LLM integration.

The harness gives your chosen coding agent a disciplined workflow for context gathering, task capsules, merge safety, security policy, and quality gates.

## Install

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for source-repo installation and global linking.

Clone and build ContextForge:

```bash
pnpm install
pnpm build
```

Use it from another repository with a global link:

```bash
pnpm link --global
cd /path/to/target-project
contextforge init --target codex
```

## Commands

```bash
pnpm contextforge init
pnpm contextforge init --target codex
pnpm contextforge init --target all
pnpm contextforge doctor
pnpm contextforge config show
pnpm contextforge config set defaultWorkflow SDD+TDD
pnpm contextforge task "Define invoice API examples" --workflow SDD+EDD
pnpm contextforge compile TASK-001 --target codex
```

Common flags for core commands:

```bash
--target codex|claude|copilot|pi|all
--dry-run
--force
--json
```

Task-only workflow override:

```bash
--workflow fast-patch|research-first|SDD|TDD|EDD|SDD+TDD|SDD+EDD|TDD+EDD
```

## Primary Flow

The chosen agent owns the ContextForge workflow after init.

```txt
1. Run: contextforge init --target codex
2. Open Codex in the repo.
3. Ask: "Run ContextForge task workflow for invoice API examples. Use SDD+EDD."
4. Codex creates or updates .contextforge/tasks/TASK-XXX/.
5. Use compile only when you want a deterministic target brief.
```

The CLI task command remains available for headless or scripted use:

```bash
contextforge task "Define invoice API examples" --workflow SDD+EDD
```

## Project Defaults

Workflow defaults live in `.contextforge/config.json` so the agent and CLI share the same policy.

```bash
pnpm contextforge config show
pnpm contextforge config set defaultWorkflow task-fit
pnpm contextforge config set defaultWorkflow SDD+TDD
pnpm contextforge config set requireWorkflowReason true
pnpm contextforge config set contextBudget proportional
```

Use `task-fit` when the agent should choose the smallest workflow that fits the task. Use a concrete workflow when the whole project should default to that method unless a task says otherwise.

More detail:

- [Configuration](docs/CONFIGURATION.md)
- [Workflows](docs/WORKFLOWS.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)

## What Init Creates

Every target gets the neutral source of truth:

```txt
.contextforge/
  config.json
  policy.json
  wiki/
  tasks/_template/
  targets/
```

Codex target:

```txt
AGENTS.md or AGENTS.contextforge.suggested.md
.agents/skills/contextforge-init/SKILL.md
.agents/skills/contextforge-doctor/SKILL.md
.agents/skills/contextforge-task/SKILL.md
.agents/skills/contextforge-review/SKILL.md
.agents/skills/contextforge-workflow/SKILL.md
.agents/skills/contextforge-write-policy/SKILL.md
```

Claude, Copilot, and Pi Code receive their own target adapters under `CLAUDE.md`, `.claude/`, `.github/`, or `.pi/`. Claude and Pi Code get `SKILL.md` workflow packages; Copilot gets repository instructions and reusable prompt files.

## Context Budget

ContextForge keeps root instruction files small. Detailed workflows live in target skills or prompts and should be loaded only when the current task calls for them.

Durable notes go in explicit homes:

```txt
doctor findings -> .contextforge/wiki/
task capsules   -> .contextforge/tasks/TASK-XXX/
compiled briefs -> .contextforge/tasks/TASK-XXX/exports/
decisions       -> .contextforge/wiki/decisions.md
```

## Merge Safety

ContextForge preserves existing agent instructions. If `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md` already exists, init writes a `.contextforge.suggested.md` file instead of replacing it.

Use `contextforge doctor` to audit the setup and ask your chosen agent to propose a human-approved merge.

## Quality Gates

```bash
pnpm build
pnpm test
pnpm contextforge init --target codex --dry-run
pnpm contextforge doctor --json
```
