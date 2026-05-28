# Commands and UX

## `akrctx init`

Installs the akrctx harness into the current repository.

```bash
akrctx init
akrctx init --target codex
akrctx init --target all
akrctx init --target copilot --dry-run
akrctx init --target copilot --profile regulated
akrctx init --target copilot --template test-template
akrctx init --target copilot --template-pack ./company-template
akrctx init --force          # update akrctx-owned files that already exist
```

Flow:

```
1. scan current directory
2. detect existing agent setup (Codex, Claude, Copilot, Pi)
3. ask which target if ambiguous (skipped with --target)
4. create .akrctx/ — neutral source of truth
5. install target-specific harness files
6. apply the selected profile and template pack when provided
7. preserve existing instruction files (AGENTS.md, CLAUDE.md, etc.)
8. report what was created, updated, or suggested
```

If a protected file already exists, init writes a suggested variant instead:

```
AGENTS.md → AGENTS.akrctx.suggested.md
CLAUDE.md → CLAUDE.akrctx.suggested.md
```

---

## `akrctx doctor`

Audits the akrctx setup and writes a readiness report.

```bash
akrctx doctor
akrctx doctor --json
akrctx doctor --ci
akrctx doctor --ci --json
```

Reports:

- installed targets
- missing harness files
- pending suggested merges
- config gaps
- judge misconfiguration (enabled but files missing)
- version drift between installed harness and current CLI
- readiness score (0–100)
- suggested agent prompt to continue the audit intelligently

`--ci` exits with `0` when the harness is healthy and `1` when there are actionable gaps. Use it in protected branches or CI pipelines.

---

## `akrctx templates`

Lists bundled enterprise template packs shipped with the CLI package.

```bash
akrctx templates list
akrctx templates list --json
```

Bundled templates live under `templates/<name>/` in the source package and can be applied with:

```bash
akrctx init --target copilot --template <name>
```

Path-based template packs can be applied with:

```bash
akrctx init --target copilot --template-pack ./company-template
```

See [ENTERPRISE.md](ENTERPRISE.md) for the template pack format.

---

## `akrctx status`

Quick install summary.

```bash
akrctx status
akrctx status --json
```

Shows installed targets, task count, recent task IDs, default workflow, and context budget.

---

## `akrctx upgrade`

Updates akrctx-owned harness files to the current CLI version.

```bash
akrctx upgrade
akrctx upgrade --target codex
akrctx upgrade --dry-run
```

Rewrites skill files, prompts, and instructions. Protected files (AGENTS.md, CLAUDE.md, copilot-instructions.md) are never overwritten.

Run `akrctx doctor` after upgrading to verify the result.

---

## `akrctx task`

Creates a task capsule. Intended as a headless fallback for scripts and CI. During normal agent-assisted work the agent creates the capsule itself.

```bash
akrctx task "Fix regression in invoice calculation"
akrctx task "Define invoice API examples" --workflow SDD+EDD
akrctx task "Create settings screen" --workflow "UI review"
```

Creates under `.akrctx/tasks/TASK-XXX-<slug>/`:

```
task.md
context.md
plan.md
acceptance-criteria.md
review-checklist.md
```

Workflow is chosen automatically from the task description unless overridden with `--workflow`.

---

## `akrctx compile`

Compiles a task capsule into a single agent-ready brief.

```bash
akrctx compile TASK-001
akrctx compile TASK-001 --target codex
akrctx compile TASK-001 --target claude
```

Concatenates task.md + context.md + plan.md + acceptance-criteria.md into:

```
.akrctx/tasks/TASK-001/exports/<target>.md
```

Paste or reference this file in your agent session when you need a deterministic brief.

---

## `akrctx config`

Shows or updates project defaults stored in `.akrctx/config.json`.

```bash
akrctx config show

akrctx config set defaultWorkflow task-fit
akrctx config set defaultWorkflow SDD+TDD
akrctx config set defaultTarget codex
akrctx config set requireTaskCapsule true
akrctx config set requireWorkflowReason true
akrctx config set contextBudget proportional
```

Valid `contextBudget` values: `minimal` | `proportional` | `thorough`.

---

## `akrctx judge`

Manages the optional judge subagent. The judge independently reviews whether an implementation matches the task capsule. Disabled by default.

```bash
akrctx judge enable           # enable + install agent files for installed targets
akrctx judge enable --dry-run # preview files that would be created
akrctx judge disable          # disable (files are kept, remove manually if needed)
akrctx judge status           # show enabled state and which agent files exist
```

Pi is not supported — it has no native subagent API.

See [JUDGE.md](JUDGE.md) for the full flow including how to set a model.

---

## `akrctx remove`

Removes akrctx harness files for a target.

```bash
akrctx remove --target codex              # dry-run: list what would be removed
akrctx remove --target codex --force      # remove codex skill files
akrctx remove --all --force               # remove .akrctx/ and all target files
```

Protected files (AGENTS.md, CLAUDE.md, copilot-instructions.md) are always skipped — remove them manually if needed.

---

## Common flags

| Flag | Effect |
|---|---|
| `--target <target>` | `codex` \| `claude` \| `copilot` \| `pi` \| `all` |
| `--dry-run` | Show planned writes without creating files |
| `--force` | Update akrctx-owned files that already exist |
| `--json` | Emit JSON output for scripting |
