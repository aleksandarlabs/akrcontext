# Judge

The akrctx judge is an optional subagent that independently reviews whether an implementation matches the task capsule. It is separate from the primary coding agent, reconstructs the exact change boundary itself, and reads without modifying product code or Git state.

## How it works

After the primary agent finishes implementing a task, it offers the user the option to invoke the judge. The user confirms. The judge reads the task capsule (`task.md`, `acceptance-criteria.md`, `plan.md`) and the changed files, then reports:

- **APPROVED** — implementation matches the task capsule.
- **NEEDS CHANGES** — mostly correct but has specific gaps.
- **BLOCKED** — does not match the goal or has critical issues.

The judge reports its exact base/candidate boundary, validation evidence, and a structured review record. It does not implement its own feedback. If changes are needed, the user hands them back to the primary agent. An enabled comprehension evaluator runs only after deterministic verification confirms `APPROVED` for the current boundary.

## Deterministic enforcement

Before review, the trusted caller captures the boundary and passes the immutable candidate
to the judge:

```bash
akrctx judge snapshot TASK-001 --base main --json
akrctx judge scope TASK-001 --base main --candidate SNAPSHOT:<id> --json
```

Capture writes only below the ignored `.akrctx/local/judge/snapshots/` directory. It creates
a shallow private Git repository containing the candidate and base commits, overlays
tracked and allowed untracked changes, removes policy-blocked paths from the reviewable
worktree, and copies local Node dependencies when present instead of linking to the live
project. It does not change live refs, branch, index, stash, worktree files, or history.

The scope contains SHA-256 digests of the five task-capsule documents and exact changed
boundary. The judge copies it unchanged into the final JSON record. Commit and strict
`WORKTREE` candidates remain supported for compatibility.

Before accepting the verdict or starting comprehension:

```bash
akrctx judge verify .akrctx/local/judge/TASK-001/review.json --run-tests
```

Verification validates the record and recomputes its immutable scope. It exits
unsuccessfully when the verdict is not `APPROVED`, the snapshot or one of its catch-up
ancestors changed or disappeared, the record was produced by a different akrctx version,
or the record is malformed. New edits in the live project do not invalidate a correct
historical approval.

The version check is deliberate: approval rules change between releases, so a record written under older rules must not silently satisfy a newer gate.

### What APPROVED requires

An `APPROVED` record must also be backed by evidence and internally coherent. Verification rejects it when:

- **no validation passed** — `tests` must contain at least one entry with `status: "passed"`. A review that executed nothing cannot approve. A judge that could not run any command reports `BLOCKED` and says which command it could not run.
- **the passing command was invented** — when the capsule declares commands, at least one passing entry must be one of them (see below).
- **issues remain** — `issues` must be empty. A verdict cannot approve and list unresolved defects at the same time; that is `NEEDS_CHANGES`.

A `failed` entry in `tests` invalidates the record under any verdict. These rules apply only to `APPROVED` — a `NEEDS_CHANGES` or `BLOCKED` record is expected to carry issues and unrun commands.

### Declared validation commands

A capsule's `task.md` declares its validation commands in a fenced block under `## Validation`:

````markdown
## Validation

```
pnpm test
pnpm lint
```
````

Those commands are the ones that count as evidence. Without this rule a judge could approve on `tests: [{ command: "echo ok", status: "passed" }]`.

Verification distinguishes three cases, so backward compatibility cannot be used to weaken the gate:

| Capsule | Behaviour |
|---|---|
| No `## Validation` section | Predates the section. Falls back to the weaker "any passing command" rule so older capsules keep working. |
| Section present, commands declared | The strict rule applies: a declared command must be among the passing ones. |
| Section present, block empty or malformed | Rejected for `APPROVED`. The section exists, so the commands were meant to be filled in — this is an unfinished capsule, not a legacy one. |

`akrctx task` generates the section with an empty block, so every capsule created from this version on falls in the second or third row.

### Independent re-execution

By default a passing command is taken from the record on trust. To check it instead:

```bash
akrctx judge verify .akrctx/local/judge/TASK-001/review.json --run-tests
```

This re-runs the capsule-declared commands the record claims passed. Snapshot validation
runs in a disposable copy outside the live project, including the snapshot's private Node
dependencies when present. Verification fails if a command fails or changes tracked
reviewed content. Ignored build output is discarded with the disposable workspace and the
immutable snapshot is never mutated by verification.

This is isolation for ordinary relative writes, not an operating-system sandbox. A
malicious command can still use absolute paths or external programs, so read the capsule's
validation block before executing work you did not supervise.

**What `--run-tests` executes, and whose trust that is.** It runs the commands declared in the capsule's `task.md` through a shell. Two things follow:

- A review record **cannot** inject a command. Only declared commands are ever executed, so the agent-written record has no path to a shell.
- The capsule **can**. In the normal akrctx flow the primary agent writes the capsule, so `task.md` is agent-authored project content, not a human-authored file. `--run-tests` therefore *moves* trust from the review record to the task capsule; it does not eliminate it.

Treat it like running `package.json` scripts from a branch: fine for a capsule you or your own agent produced and can read, not a defence against a compromised primary agent or an untrusted branch — that agent could write both the capsule and the record. Read `task.md` before passing the flag on work you did not supervise.

This is why the flag is opt-in and lives with the primary agent rather than the judge: the judge and the comprehension evaluator are read-only by contract and cannot execute anything.

### Where the strong check runs

| Stage | Verification | Why |
|---|---|---|
| Judge | none — it produces the record | Read-only; it reports what it ran |
| Primary agent, before handoff | `judge verify --run-tests` | The only trusted caller that can execute |
| Comprehension evaluator | `judge verify --json` plus `judge current --json` | Read-only contract; confirms approval validity and live applicability, not that tests re-ran |

A re-execution result is not transferable: a later agent that only runs plain `verify` learns the boundary is intact, not that validation was independently repeated. If you need that guarantee to survive the handoff, it has to come from CI or another trusted orchestrator, not from the record.

### Withheld paths

Files matching `blockedReadPatterns` in `policy.json` are excluded from the diff at the Git level and listed by path in `scope.excludedPaths`. Their contents are never fingerprinted, and blocked tracked paths are removed from the snapshot's reviewable worktree after checkout. The path list is itself part of the boundary, so a blocked file appearing or disappearing still invalidates a stale approval.

This is the one place where `blockedReadPatterns` is mechanically applied to both the
boundary and reviewable worktree. It is not encryption: the private Git repository still
contains the candidate commit's object database, and a tracked secret must be removed from
Git history separately. Because boundary filtering fails closed, an unusable
`policy.json` makes capture and scope computation fail instead of silently weakening the
rule.

This applies to tracked and untracked files alike. Earlier versions aborted the whole scope when an untracked blocked file was present; that was wrong in practice, because patterns like `.env.*` match ordinary non-secret files such as `.env.example`. A judge that cannot review meaningfully without the withheld files should report `BLOCKED`.

## What this does and does not prove

It proves the verdict is bound to a specific task capsule and code boundary, that the boundary still matches the repository, and — with `--run-tests` — that the declared validation really passes.

It does not prove which model produced the verdict. The judge is read-only by design, so a trusted caller writes the record to disk, and that caller could in principle write one the judge never produced. Nothing in this repository can close that gap; a signature would need a trust anchor outside it.

The mitigation is human. The judge's prose review appears in the session transcript, and the developer reads it. Treat a verified record as tamper-evident bookkeeping, not as an unforgeable signature.

## Current state and catch-up review

After strong verification, compare the approved snapshot with the live workspace:

```bash
akrctx judge current .akrctx/local/judge/TASK-001/review.json
```

The command rejects malformed, non-approved, or boundary-invalid records before reporting
`CURRENT`, `NEWER_CHANGES`, or `DIVERGED`. When work has advanced on the same lineage,
capture only the delta:

```bash
akrctx judge snapshot TASK-001 --from-review .akrctx/local/judge/TASK-001/review.json
```

Catch-up re-runs the parent's declared passing validation, binds the exact parent record,
and recursively requires every ancestor snapshot to remain intact. It never extends an old
approval over new code silently.

## Local retention

Snapshots are local, ignored artifacts. Preview retention before deleting anything:

```bash
akrctx judge prune --keep 5
akrctx judge prune --keep 5 --force
```

Pruning keeps the newest requested snapshots and any ancestors they require. The command
is a dry-run unless `--force` is supplied.

## Enabling the judge

```bash
akrctx judge enable
```

This sets `judge.enabled = true` in `.akrctx/config.json` and generates agent files for each installed target:

| Target | File |
|---|---|
| Claude Code | `.claude/agents/akrctx-judge.md` |
| GitHub Copilot | `.github/agents/akrctx-judge.agent.md` |
| Codex | `.codex/agents/akrctx-judge.toml` |
| Pi | Not supported — no native subagent API |

To preview what would be generated without writing files:

```bash
akrctx judge enable --dry-run
```

## Checking status

```bash
akrctx judge status
```

## Disabling the judge

```bash
akrctx judge disable
```

This sets `judge.enabled = false` in config. The agent files are kept — delete them manually if you no longer need them.

## Setting a model

The generated agent files do not specify a model. By default the judge inherits whatever model the platform selects. To use a specific model for the judge, edit the generated file and add the model field manually.

> Model identifiers are platform-specific and change over time. Always check your platform's current documentation — do not copy identifiers from examples here.

### Claude Code

Edit `.claude/agents/akrctx-judge.md` and add `model` to the frontmatter:

```yaml
---
name: akrctx-judge
description: ...
tools: Read, Glob, Grep, Bash
permissionMode: plan
model: <model-id>   ← add this line
---
```

Valid model values: a full model ID (`claude-opus-4-7-20251101`), a short alias (`opus`, `sonnet`, `haiku`), or `inherit` (explicit inherit from session). See [Claude Code subagent docs](https://code.claude.com/docs/en/sub-agents) for the current list.

### GitHub Copilot

Edit `.github/agents/akrctx-judge.agent.md` and add `model` to the frontmatter:

```yaml
---
name: akrctx Judge
description: ...
tools: ["read", "search", "execute"]
model: <model-id>   ← add this line
---
```

Copilot model identifiers use a display-name format that includes the provider label (e.g. `"GPT-5.4 (copilot)"`). The exact format is shown in the Copilot model picker inside VS Code or GitHub. See [Copilot custom agents docs](https://docs.github.com/en/copilot/reference/custom-agents-configuration) for details.

### Codex

Edit `.codex/agents/akrctx-judge.toml` and add a `model` field:

```toml
name = "akrctx-judge"
description = "..."
model = "<model-id>"   ← add this line
model_reasoning_effort = "high"
sandbox_mode = "read-only"
developer_instructions = "..."
```

See [Codex subagent docs](https://developers.openai.com/codex/subagents) for valid model identifiers.

## Pi

Pi does not have a native subagent API. The judge is not available for Pi targets. `akrctx judge enable` skips Pi automatically.
