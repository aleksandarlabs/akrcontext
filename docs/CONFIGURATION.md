# Configuration

akrctx stores project defaults in:

```txt
.akrctx/config.json
```

The config is shared by the CLI and the installed agent harness.

## Show Config

```bash
akrctx config show
```

## Set Defaults

```bash
akrctx config set defaultWorkflow task-fit
akrctx config set defaultWorkflow SDD+TDD
akrctx config set defaultTarget codex
akrctx config set allowedWorkflows SDD,TDD,fast-patch
akrctx config set requireTaskCapsule true
akrctx config set requireWorkflowReason true
akrctx config set contextBudget proportional
```

## Workflow Default

Use `task-fit` for most projects. It tells the agent to choose the smallest suitable workflow for each task.

Use a concrete workflow when the whole project should bias toward that process unless a task overrides it.

```json
{
  "defaults": {
    "workflow": "task-fit",
    "requireTaskCapsule": true,
    "requireWorkflowReason": true,
    "contextBudget": "proportional"
  }
}
```

## Allowed Workflows

`defaults.allowedWorkflows` restricts which workflows the agent (and the CLI `akrctx task`) may use. By default it includes every workflow.

```bash
akrctx config set allowedWorkflows SDD,TDD
akrctx config set allowedWorkflows "SDD+TDD, SDD+EDD, fast-patch"
```

Values are comma- or space-separated and normalized automatically. Invalid values are rejected.

Behavior:

- An explicit `--workflow` that is not allowed is rejected.
- A configured `defaultWorkflow` that is not allowed is rejected as a misconfiguration.
- When `task-fit` recommends a disallowed workflow, the CLI falls back to the first allowed workflow and records the reason in the task capsule.

```json
{
  "defaults": {
    "allowedWorkflows": ["SDD", "TDD", "fast-patch"]
  }
}
```

## Context Budget

- `minimal`: load only policy and current task capsule.
- `proportional`: load policy, current task capsule, and relevant wiki pages.
- `thorough`: allow broader wiki review for high-risk tasks.

Do not read all of `.akrctx/` by default.

---

## Comprehension Gate

The optional comprehension gate installs a separate learning evaluator that asks the developer code-specific questions after a significant completed change. It runs outside the implementing agent's context, may inspect Git with read-only commands, but never stages, commits, pushes, merges, resets, or otherwise changes Git state. It does not block merges or replace correctness review.

Enable it once for the project:

```bash
akrctx comprehension enable
akrctx comprehension status
akrctx comprehension disable
```

When enabled, the primary agent asks permission to invoke `akrctx-comprehension`. If the judge is enabled, the primary agent first offers the judge, saves its structured record locally, and runs `akrctx judge verify`. Comprehension independently repeats that verification and starts only for an APPROVED record bound to the current task and code. It then reconstructs the change, skips surface-only work, renders a change map and test matrix, and conducts a short interactive checkpoint for meaningful logic, architecture, security, persistence, infrastructure, or other material risks.

The handoff is deliberately narrow: task ID, exact base/candidate boundary, and judge verdict. The implementing agent must not provide its explanations, proposed questions, expected answers, or conclusions. See [COMPREHENSION.md](COMPREHENSION.md) for the full protocol and platform differences.

Personal answers, hints, and results belong in `.akrctx/local/comprehension/TASK-XXX/<session-id>/`. The installed `.akrctx/local/.gitignore` keeps new records out of version control by default. Before persistence, the agent verifies the path with read-only Git commands; if it cannot verify this, it keeps the interaction in chat. Git ignore rules are not encryption and do not protect files from other local software or backups.

```json
{
  "comprehensionGate": {
    "enabled": false,
    "trigger": "agent-assessed-significance",
    "evaluationMode": "prefer-independent"
  }
}
```

---

## Profiles

Profiles are installation presets stored in `.akrctx/config.json` and `.akrctx/policy.json`.

```bash
akrctx init --target codex --profile default
akrctx init --target copilot --profile strict
akrctx init --target copilot --profile regulated
```

- `default`: standard akrctx behavior.
- `strict`: uses `contextBudget: thorough` and adds stricter blocked-read patterns.
- `regulated`: inherits strict policy, adds regulated-material blocked reads, and routes small safe patches to `TDD` instead of `fast-patch`.

Example config fields:

```json
{
  "profile": "regulated",
  "defaults": {
    "contextBudget": "thorough"
  },
  "workflowRules": {
    "smallSafePatch": "TDD",
    "default": "research-first"
  }
}
```

`akrctx doctor` validates profile-specific policy requirements.

### Applied template packs

Successful post-init template applications are recorded in `templatePacks`:

```json
{
  "templatePacks": [
    {
      "name": "company-base",
      "version": "1.0.0",
      "source": "bundled",
      "targets": ["copilot"],
      "fileHashes": {
        ".github/skills/company-review/SKILL.md": "sha256:..."
      }
    }
  ]
}
```

The hashes keep template-owned target files distinct from obsolete core harness files during upgrades. Use `akrctx templates status` instead of editing this registry manually.

### Protected instruction merges

`policy.json` keeps root instruction files protected by default and defines one narrow Doctor exception:

```json
{
  "protectedFileMerge": {
    "agentMayEdit": "after-explicit-human-approval",
    "approvalScope": "current-conversation",
    "requireDiffPreview": true
  }
}
```

The agent must show the exact minimal diff first. Only explicit approval of that diff in the current conversation permits the edit; a changed proposal requires new approval. This is an agent policy, not an operating-system permission boundary.

---

## Upgrade provenance

`.akrctx/manifest.json` stores SHA-256 hashes only for generated files that akrctx actually wrote. `akrctx upgrade` compares each current file with its recorded hash:

- matching hash: safe automatic update;
- current template already present: preserve and register it;
- missing or mismatched provenance: preserve and write `.akrctx/upgrades/<version>/<path>`;
- obsolete generated path: report and preserve.

Wiki pages, tasks, local records, and root agent instructions are project-owned and excluded from automatic replacement. `installedVersion` advances only after every installed target has been upgraded without blocking conflicts.

## Judge

The judge is an optional subagent that independently reviews implementation against the task capsule. It is disabled by default.

```bash
akrctx judge enable   # install judge files and set enabled: true
akrctx judge disable  # set enabled: false (files are kept)
akrctx judge status   # show state
akrctx judge snapshot TASK-001 --base main --json
akrctx judge scope TASK-001 --base main --candidate SNAPSHOT:<id> --json
akrctx judge verify .akrctx/local/judge/TASK-001/review.json --run-tests
akrctx judge current .akrctx/local/judge/TASK-001/review.json
```

The normal concurrent workflow captures `akrctx judge snapshot TASK-001 --base <ref>`,
reviews its `SNAPSHOT:<id>` candidate, verifies with `--run-tests`, and then uses
`akrctx judge current <review.json>` to classify live applicability. Catch-up uses
`judge snapshot --from-review <review.json>`. Local snapshots are ignored and can be
preview-pruned with `akrctx judge prune --keep <n>`; add `--force` to apply deletion.

The enabled state is stored in config:

```json
{
  "judge": {
    "enabled": false,
    "trigger": "post-implementation"
  }
}
```

**Do not set `enabled: true` manually in `config.json`** without running `akrctx judge enable` first. If the judge is enabled but no agent files exist, `akrctx doctor` will detect the gap and prompt you to run `judge enable`.

Each platform's judge agent file is installed in the native subagent location for that target. The model comes from `agents.judge.model.<target>` and is regenerated by `akrctx upgrade`. See [JUDGE.md](JUDGE.md) for per-platform identifiers.

---

## Agents

`agents` is the canonical configuration for akrctx agents: which are enabled, when they
trigger, which hosts they are emitted for, and which model each host runs them with.

```json
{
  "agents": {
    "judge": {
      "enabled": true,
      "trigger": "post-implementation",
      "targets": ["claude", "codex"],
      "model": { "claude": "opus", "codex": "gpt-5-codex" }
    },
    "comprehension": { "enabled": true },
    "implementer": { "enabled": false, "maxAttempts": 3 }
  }
}
```

It holds exactly three entries — `judge`, `comprehension`, `implementer` — and no others.
A project cannot declare an agent of its own here, because each of the three is
trustworthy only through a CLI contract behind it (`judge verify --run-tests`, the
comprehension schemas, the `akrctx impl` attempt store). An entry with no command behind
it would be an agent akrctx generates and cannot vouch for.

Every field is optional. An absent field falls back to the built-in default.

| Field | Meaning |
| --- | --- |
| `enabled` | Whether the agent is emitted and offered. Default `false`. |
| `trigger` | A scheduling hint the lead agent / host may honour. A free string akrctx propagates but does not enforce (see below). |
| `targets` | Narrows emission to a subset of the installed targets. |
| `model` | Per target: `{ "claude": …, "codex": …, "copilot": … }`. |
| `maxAttempts` | `implementer` only. Positive integer, default `3`. |

Set any of them from the CLI:

```bash
akrctx config set agents.judge.enabled true
akrctx config set agents.judge.trigger post-implementation
akrctx config set agents.judge.targets "claude, codex"
akrctx config set agents.judge.model.claude opus
akrctx config set agents.implementer.maxAttempts 3
```

### `trigger` is a hint, not a switch akrctx enforces

`trigger` is advisory scheduling metadata. akrctx writes the string into the generated
agent file and reports it in `status`, but it does **not** act on it: nothing in akrctx
schedules or fires an agent at the trigger point. Whether an agent is actually invoked at
`post-implementation` or `post-clarification` depends on the lead agent / host honouring
that hint, not on akrctx enforcing it. The field is named `trigger` for brevity; treat it as
a scheduling hint the host interprets, not a switch akrctx actuates. A free string is
accepted precisely because akrctx cannot enumerate every point in a workflow a project
might want an agent invoked at, and refusing an unfamiliar value would block legitimate
work to catch a typo.

### Warnings, not errors

An unrecognized trigger and an unfamiliar model identifier are **warnings**. Both are
propagated exactly as configured, and reported by `enable`, `doctor`, `upgrade`, and
`status`. akrctx cannot enumerate every point in a workflow at which a project might want
an agent invoked, and it does not have any provider's model catalogue, so refusing an
unfamiliar value would block legitimate work to catch a typo.

`agents.implementer.maxAttempts` is the one error. Its domain is fully known, and an
unparseable budget would resolve to "no limit" — the exact failure the budget prevents.

An entry akrctx does not recognize is also a warning. It is ignored for resolution and
preserved in the file byte for byte, so a configuration written by a newer akrctx that
knows a fourth agent neither disables an older CLI nor loses its settings the next time
that CLI writes the file.

### Targets and Pi

`targets` narrows the installed targets; it never widens them. A target listed for an agent
but not installed is skipped with a warning rather than failing the command.

Pi has no agent format. It is a supported akrctx target for prompts and skills, and
configuring it under any agent's `targets` produces a warning and is skipped. Claude Code,
Codex, and Copilot are the three supported agent hosts.

### Compatibility with `judge`, `comprehensionGate`, and `impl`

The older keys keep working. `normalizeConfig` maps them onto the `agents` shape in memory,
reading a legacy config never rewrites it, and `akrctx upgrade` neither migrates nor deletes
them. When a command changes an agent setting it writes `agents.<name>` and keeps an
existing legacy key in step, so an older akrctx reading the same file still behaves the same.

When both forms are present and disagree — because they were hand-edited apart — `agents`
wins and `akrctx doctor` reports the divergence naming both paths and the value in effect.

---

## Implementer

The implementer is an optional agent that implements one task capsule against its
acceptance criteria and records every round in an append-only log.

```bash
akrctx impl enable                 # install the agent files, set agents.implementer.enabled
akrctx impl start TASK-001         # open or resume the log, get the round number
akrctx impl log TASK-001 ...       # append one round record
akrctx impl status TASK-001        # attempts used, remaining, last blocker
```

The log lives at `.akrctx/local/impl/<TASK-ID>/log.md`, which `.akrctx/local/.gitignore`
already excludes. That placement is load-bearing: a log inside the capsule would be a
tracked file in the review diff, which would let the judge read the implementing agent's
own account of its work as evidence. Writing a round never moves `taskDigest`.

Because that guarantee rests on a file the store does not own, every `impl` command checks
it. If `.akrctx/local/.gitignore` is missing or no longer ignores local storage, `impl
enable` refuses and `start`, `log`, and `status` report the task as stopped with no attempt
count, until `akrctx doctor --fix` restores it.

The attempt count is derived from the persisted records, never supplied by the caller, so a
fresh agent instance reads the true count instead of assuming it is the first. `impl log`
enforces the budget itself: a caller that skips `impl start` does not thereby escape the
limit. A log that cannot be parsed is reported as unreadable rather than as zero attempts
used — an untrustworthy log must not grant a fresh budget.

---

## Full config.json shape

```json
{
  "version": 1,
  "installedVersion": "0.3.0",
  "profile": "default",
  "targets": ["codex"],
  "judge": {
    "enabled": false,
    "trigger": "post-implementation"
  },
  "comprehensionGate": {
    "enabled": false,
    "trigger": "agent-assessed-significance",
    "evaluationMode": "prefer-independent"
  },
  "agents": {
    "judge": { "enabled": false, "model": { "claude": "opus" } },
    "comprehension": { "enabled": false },
    "implementer": { "enabled": false, "maxAttempts": 3 }
  },
  "defaults": {
    "workflow": "task-fit",
    "allowedWorkflows": ["fast-patch", "research-first", "SDD", "TDD", "EDD", "SDD+TDD", "SDD+EDD", "TDD+EDD"],
    "requireTaskCapsule": true,
    "requireWorkflowReason": true,
    "contextBudget": "proportional"
  },
  "workflowRules": {
    "default": "task-fit",
    "bugfix": "TDD",
    "apiOrContract": "SDD+TDD",
    "edgeCases": "SDD+EDD",
    "ui": "UI review",
    "smallSafePatch": "fast-patch",
    "unknownArea": "research-first"
  }
}
```
