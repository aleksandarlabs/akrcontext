# akrctx

A workflow discipline specification for AI coding agents, with a reference CLI implementation.

**Built by [AleksandarLabs](https://aleksandarlabs.com)**

---

Coding agents are powerful reasoners but poor process followers. Each session starts from zero — no memory of why a file exists, no agreed methodology, no quality gates. The agent guesses. Sometimes it gets it right. Sometimes it doesn't.

akrctx installs a harness into your repository that gives your coding agent structured workflows (SDD, TDD, EDD, research-first, fast-patch), task capsules, context budgets, merge safety, and an optional independent judge — all persisted across sessions and portable across agents.

It is not a coding agent, web app, telemetry service, or LLM integration. It is an installer that generates files your agent reads in the next session.

**Supports:** Codex · Claude Code · GitHub Copilot · Pi Code

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
akrctx init                             # detect agent and install harness
akrctx init --target codex             # install for specific target
akrctx init --target all               # install for all targets
akrctx init --target copilot --profile regulated
akrctx init --target copilot --template test-template
akrctx doctor                          # audit setup, lint wiki, write readiness reports
akrctx doctor --ci                     # fail CI when setup has actionable gaps
akrctx doctor --fix                    # recreate missing files and repair config/policy gaps
akrctx status                          # quick summary of installed targets and tasks
akrctx upgrade                         # update harness files to current CLI version
akrctx config show
akrctx config set defaultWorkflow SDD+TDD
akrctx task "Define invoice API examples" --workflow SDD+EDD
akrctx compile TASK-001 --target codex
akrctx judge enable                    # install optional judge subagent
akrctx judge status
akrctx judge scope TASK-001 --base main --candidate WORKTREE --json
akrctx judge verify .akrctx/local/judge/TASK-001/review.json
akrctx comprehension enable            # enable developer understanding checkpoints
akrctx comprehension status
akrctx remove --target codex --force   # remove harness for a target
akrctx templates list                  # list bundled enterprise templates
```

Common flags:

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
akrctx config show
akrctx config set defaultWorkflow task-fit
akrctx config set defaultWorkflow SDD+TDD
akrctx config set allowedWorkflows SDD,TDD,fast-patch
akrctx config set requireWorkflowReason true
akrctx config set contextBudget proportional
```

Use `task-fit` when the agent should choose the smallest workflow that fits the task. Use a concrete workflow when the whole project should default to that method unless a task says otherwise.

More detail:

- [Configuration](docs/CONFIGURATION.md)
- [Workflows](docs/WORKFLOWS.md)
- [Enterprise usage](docs/ENTERPRISE.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)

## What Init Creates

Every target gets the neutral source of truth:

```txt
.akrctx/
  config.json
  manifest.json
  policy.json
  comprehension/
    README.md
    schemas/
  judge/
    README.md
    schemas/review.schema.json
  local/
    .gitignore
  upgrades/                  # preserved-file merge candidates
  wiki/
    overview.md
    index.md
    architecture.md
    conventions.md
    testing.md
    workflows.md
    decisions.md
    agent-setup.md
    gaps.md
    recommendations.md
    write-policy.md
    log.md
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
.codex/agents/akrctx-comprehension.toml  # optional; created by comprehension enable
```

Claude, Copilot, and Pi Code receive their own target adapters under `CLAUDE.md`, `.claude/`, `.github/`, or `.pi/`. Claude and Pi Code get `SKILL.md` workflow packages; Copilot gets repository instructions, skills, and reusable prompt files.

## Context Budget

akrctx keeps root instruction files small. Detailed workflows live in target skills or prompts and should be loaded only when the current task calls for them.

Durable notes go in explicit homes:

```txt
doctor findings   -> .akrctx/wiki/agent-setup.md
                    .akrctx/wiki/gaps.md
                    .akrctx/wiki/recommendations.md
wiki catalog      -> .akrctx/wiki/index.md
task capsules     -> .akrctx/tasks/TASK-XXX/
personal comprehension records -> .akrctx/local/comprehension/ (Git-ignored)
compiled briefs   -> .akrctx/tasks/TASK-XXX/exports/
decisions         -> .akrctx/wiki/decisions.md
architecture      -> .akrctx/wiki/architecture.md
conventions       -> .akrctx/wiki/conventions.md
testing commands  -> .akrctx/wiki/testing.md
```

## Merge Safety

akrctx preserves existing agent instructions. If `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md` already exists, init writes a `.akrctx.suggested.md` file instead of replacing it.

Use `akrctx doctor` to audit the setup. The agent compares the protected file with its suggestion and shows an exact minimal diff. It may edit the protected file only after you explicitly approve that diff in the current conversation; changed proposals require fresh approval.

## Security Model

`policy.json` (`blockedReadPatterns`, `protectedFiles`, `protectedFileMerge`, `enforcement.*`) and the write-policy skill are **prompt-level / convention-level controls, not technical enforcement**. They give a cooperative coding agent clear instructions about what not to read or overwrite — including the exact human-approval exception for protected instruction merges — but they do not sandbox the agent or resist a malicious or compromised agent, prompt injection, or a template pack designed to weaken them.

Treat akrctx's policy as documentation the agent is expected to follow, not a security boundary. To actually restrict what an agent can read or write, complement it with:

- Your coding agent's own permission system (e.g. Claude Code deny rules, sandboxed tool execution).
- `.gitignore` / secret-scanning for anything under `blockedReadPatterns` (`.env`, `*.pem`, `credentials/`, etc.) so secrets are not present in the working tree at all.
- Branch protection / code review for any change touching `.akrctx/policy.json` or a template pack, since both can relax enforcement (see `akrctx init`'s policy-weakening warning).

## Quality Gates

```bash
pnpm build
pnpm test
akrctx init --target codex --dry-run
akrctx doctor --json
```
