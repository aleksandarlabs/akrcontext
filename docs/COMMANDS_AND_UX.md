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
akrctx doctor --fix              # recreate missing files and repair config/policy gaps
akrctx doctor --fix --dry-run    # preview what --fix would do
```

Reports:

- installed targets
- missing harness files
- pending suggested merges
- config gaps
- policy gaps
- judge misconfiguration (enabled but files missing)
- version drift between installed harness and current CLI
- wiki lint: broken links, orphan pages, and missing or invalid frontmatter timestamps
- readiness score (0–100)
- suggested agent prompt to continue the audit intelligently

`--ci` exits with `0` when the harness is healthy and `1` when there are actionable gaps. Use it in protected branches or CI pipelines.

`--fix` automatically recreates missing harness files and merges missing keys into `.akrctx/config.json` and `.akrctx/policy.json`. It does not create new protected-file suggestions merely because a protected file already exists.

For a pending instruction merge, the Doctor agent compares the protected file with its `.akrctx.suggested.md` candidate and presents the exact minimal diff. The protected file remains read-only until the human explicitly approves that exact diff in the current conversation. After approval, the agent applies only the shown changes, displays the result, reruns Doctor, and removes the candidate only after verification. A changed proposal requires a new approval.

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

### Apply after initialization

```bash
akrctx templates apply company-base
akrctx templates apply ./company-template --local
akrctx templates apply security-rules --target copilot --dry-run
akrctx templates status
akrctx templates status --json
```

`templates apply` requires an installed harness and valid manifest. It never reruns `init` and rejects `--force`. With one installed target it selects it automatically; projects with multiple targets must pass one explicit `--target` and apply once per target.

Several packs are composed by applying them sequentially. Existing non-root content that differs is preserved and receives a versioned candidate under `.akrctx/template-candidates/<name>/<version>/`. These conflicts block the pack transaction, so config, policy, and missing files remain unchanged until the candidate is resolved and the command is rerun. Root instructions are nonblocking: they use `.akrctx.suggested.md` and the human-approved Doctor merge workflow.

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

Safely migrates an installed harness after the akrctx npm package is updated.

```bash
akrctx upgrade
akrctx upgrade --target codex
akrctx upgrade --dry-run
```

The upgrade uses `.akrctx/manifest.json` hashes to update only verified, unchanged generated files. Wiki pages, task capsules, local records, and root instructions are never overwritten. Existing legacy or modified generated files receive candidates under `.akrctx/upgrades/<version>/`; resolve them and rerun the command before `installedVersion` advances. Obsolete generated files are reported but never deleted.

`config.json` and `policy.json` are migrated field by field while retaining project values. Invalid JSON is preserved as a blocking conflict. `--force` is intentionally rejected for upgrades.

Typical published-package flow:

```bash
npm install -g akr-context@latest
cd my-project
akrctx upgrade --dry-run
akrctx upgrade
akrctx doctor
```

Run `akrctx doctor` after upgrading to verify the result.

---

## `akrctx task`

Creates, lists, shows, or removes task capsules. Intended as a headless fallback for scripts and CI. During normal agent-assisted work the agent creates the capsule itself.

```bash
akrctx task "Fix regression in invoice calculation"
akrctx task "Define invoice API examples" --workflow SDD+EDD
akrctx task "Create settings screen" --workflow "UI review"

akrctx task list
akrctx task show TASK-001
akrctx task rm TASK-001
akrctx task rm TASK-001 --dry-run
```

`akrctx task <description>` is a backwards-compatible shortcut for `akrctx task create <description>`.

Creates under `.akrctx/tasks/TASK-XXX-<slug>/`:

```
task.md
context.md
plan.md
acceptance-criteria.md
review-checklist.md
```

Workflow is chosen automatically from the task description unless overridden with `--workflow`.

`akrctx task list` prints all task capsules with their descriptions. `akrctx task show TASK-001` prints every file in the capsule. `akrctx task rm TASK-001` removes the capsule directory.

---

## `akrctx compile`

Compiles a task capsule into a single agent-ready brief.

```bash
akrctx compile TASK-001
akrctx compile TASK-001 --target codex
akrctx compile TASK-001 --target claude
akrctx compile TASK-001 --target all
```

Concatenates task.md + context.md + plan.md + acceptance-criteria.md into:

```
.akrctx/tasks/TASK-001/exports/<target>.md
```

`--target all` compiles one brief for every target listed in `.akrctx/config.json`.

Paste or reference this file in your agent session when you need a deterministic brief.

---

## `akrctx config`

Shows or updates project defaults stored in `.akrctx/config.json`.

```bash
akrctx config show

akrctx config set defaultWorkflow task-fit
akrctx config set defaultWorkflow SDD+TDD
akrctx config set defaultTarget codex
akrctx config set allowedWorkflows SDD,TDD,fast-patch
akrctx config set requireTaskCapsule true
akrctx config set requireWorkflowReason true
akrctx config set contextBudget proportional
```

Valid `contextBudget` values: `minimal` | `proportional` | `thorough`.

`allowedWorkflows` accepts a comma- or space-separated list of workflows (e.g. `SDD,TDD,fast-patch`). The list is normalized and deduplicated; invalid workflows are rejected.

---

## `akrctx comprehension`

Installs and manages the optional independent developer-understanding agent. The primary agent asks before invoking it; when the judge is enabled, comprehension begins only after an APPROVED review for the same change boundary.

```bash
akrctx comprehension enable
akrctx comprehension disable
akrctx comprehension status
```

Personal sessions are stored under `.akrctx/local/comprehension/` and ignored by Git. Read-only Git inspection is allowed; Git mutations and merge control are forbidden.

Supported native agents: Codex, Claude Code, and GitHub Copilot. Pi is skipped because it has no native independent-agent surface.

---

## `akrctx judge`

Manages the optional judge subagent. The judge independently reviews whether an implementation matches the task capsule. Disabled by default.

```bash
akrctx judge enable           # enable + install agent files for installed targets
akrctx judge enable --dry-run # preview files that would be created
akrctx judge disable          # disable (files are kept, remove manually if needed)
akrctx judge status           # show enabled state and which agent files exist
akrctx judge scope TASK-001 --base main --candidate WORKTREE --json
akrctx judge verify .akrctx/local/judge/TASK-001/review.json
```

`scope` hashes the task capsule and exact code boundary. `verify` rejects malformed, non-approved, or stale review records and returns a non-zero exit code, so it can gate Comprehension or CI.

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

Protected root instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md, and .pi/README.md) are always skipped — remove them manually if needed.

---

## Common flags

| Flag | Effect |
|---|---|
| `--target <target>` | `codex` \| `claude` \| `copilot` \| `pi` \| `all` |
| `--dry-run` | Show planned writes without creating files |
| `--force` | Update akrctx-owned files that already exist |
| `--json` | Emit JSON output for scripting |
