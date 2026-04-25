# akrctx

akrctx v0.1 is a local CLI that installs an agentic workflow harness into a repository. It is not a coding agent, web app, telemetry service, or LLM integration.

The harness gives your chosen coding agent a disciplined workflow for context gathering, task capsules, merge safety, security policy, and quality gates.

## Install

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for source-repo installation and global linking.

Clone and build akrctx:

```bash
pnpm install
pnpm build
```

Use it from another repository with a global link:

```bash
pnpm link --global
cd /path/to/target-project
akrctx init --target codex
```

## Commands

```bash
pnpm akrctx init
pnpm akrctx init --target codex
pnpm akrctx init --target all
pnpm akrctx doctor
pnpm akrctx config show
pnpm akrctx config set defaultWorkflow SDD+TDD
pnpm akrctx task "Define invoice API examples" --workflow SDD+EDD
pnpm akrctx compile TASK-001 --target codex
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

The chosen agent owns the akrctx workflow after init.

```txt
1. Run: akrctx init --target codex
2. Open Codex in the repo.
3. Ask: "Run akrctx task workflow for invoice API examples. Use SDD+EDD."
4. Codex creates or updates .akrctx/tasks/TASK-XXX/.
5. Use compile only when you want a deterministic target brief.
```

The CLI task command remains available for headless or scripted use:

```bash
akrctx task "Define invoice API examples" --workflow SDD+EDD
```

## Project Defaults

Workflow defaults live in `.akrctx/config.json` so the agent and CLI share the same policy.

```bash
pnpm akrctx config show
pnpm akrctx config set defaultWorkflow task-fit
pnpm akrctx config set defaultWorkflow SDD+TDD
pnpm akrctx config set requireWorkflowReason true
pnpm akrctx config set contextBudget proportional
```

Use `task-fit` when the agent should choose the smallest workflow that fits the task. Use a concrete workflow when the whole project should default to that method unless a task says otherwise.

More detail:

- [Configuration](docs/CONFIGURATION.md)
- [Workflows](docs/WORKFLOWS.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)

## What Init Creates

Every target gets the neutral source of truth:

```txt
.akrctx/
  config.json
  policy.json
  wiki/
  tasks/_template/
  targets/
```

Codex target:

```txt
AGENTS.md or AGENTS.akrctx.suggested.md
.agents/skills/akrctx-init/SKILL.md
.agents/skills/akrctx-doctor/SKILL.md
.agents/skills/akrctx-task/SKILL.md
.agents/skills/akrctx-review/SKILL.md
.agents/skills/akrctx-workflow/SKILL.md
.agents/skills/akrctx-write-policy/SKILL.md
```

Claude, Copilot, and Pi Code receive their own target adapters under `CLAUDE.md`, `.claude/`, `.github/`, or `.pi/`. Claude and Pi Code get `SKILL.md` workflow packages; Copilot gets repository instructions, skills, and reusable prompt files.

## Context Budget

akrctx keeps root instruction files small. Detailed workflows live in target skills or prompts and should be loaded only when the current task calls for them.

Durable notes go in explicit homes:

```txt
doctor findings -> .akrctx/wiki/
task capsules   -> .akrctx/tasks/TASK-XXX/
compiled briefs -> .akrctx/tasks/TASK-XXX/exports/
decisions       -> .akrctx/wiki/decisions.md
```

## Merge Safety

akrctx preserves existing agent instructions. If `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md` already exists, init writes a `.akrctx.suggested.md` file instead of replacing it.

Use `akrctx doctor` to audit the setup and ask your chosen agent to propose a human-approved merge.

## Quality Gates

```bash
pnpm build
pnpm test
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```
