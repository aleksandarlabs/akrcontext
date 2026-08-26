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
project (for the judge's in-snapshot review; `verify --run-tests` does not trust that copy —
see Independent re-execution). It does not change live refs, branch, index, stash, worktree
files, or history.

When the captured repository is akrctx itself (`package.json.name` is `akr-context`), capture
also builds the CLI artifact required by its validation suite. This is a fixed akrctx build:
the current akrctx `esbuild` API is given the literal `src/index.ts` entry, `dist/index.js`
output, and fixed Node/ESM/bundling options. It does not read or execute `scripts.build`, any
other package script, or a build configuration from the captured repository. A consumer
project, including one with a `build` script, remains source-only and its scripts are not run.
The entry must be a regular file whose resolved path stays inside the private snapshot. A
snapshot-boundary plugin checks every local resolution and every file loaded by esbuild with
`realpath`; escaping absolute imports, relative imports, and symlinked local paths are rejected.
`package.json` is contained before it is read, and an akrctx candidate without the fixed entry
fails capture explicitly. Package imports remain external and are not traversed by this check.
The generated `dist/index.js` and external sourcemap are recorded in snapshot metadata and
included in the candidate identity; modifying either after capture invalidates the snapshot even
though `dist/` is ignored by Git.
The build happens only in the private snapshot; a failure discards the temporary capture and
never publishes a partial snapshot.

The independent judge reads the canonical snapshot as immutable evidence. Its own declared
validation runs in a disposable temporary copy, never in that canonical worktree, because normal
commands such as `pnpm build` may rewrite generated artifacts. The trusted caller later performs
the stronger `judge verify --run-tests` re-execution in a separate disposable copy.

The scope contains SHA-256 digests of the five task-capsule documents and exact changed
boundary. The judge copies it unchanged into the final JSON record. Commit and strict
`WORKTREE` candidates remain supported for compatibility.

If a `SNAPSHOT:<id>` cannot be captured, the judge falls back to the `WORKTREE` candidate and
records which boundary it reviewed in `scope.candidate`. A missing snapshot is not by itself a
reason to report `BLOCKED`; `BLOCKED` is for an unclear or unreviewable boundary. The snapshot is
preferred because it is immutable, but `WORKTREE` is a compatible boundary and `akrctx judge
verify --run-tests` still re-runs the capsule-declared commands and binds the verdict to the
boundary digest.

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
runs in a disposable copy outside the live project. Its dependencies are materialised from
the committed lockfile, not inherited from the snapshot's private copy, so re-execution
rests on the lockfile rather than on bytes inside the reviewed artifact. If the boundary
declares dependencies but has no lockfile, or the install fails, verification fails with a
named reason and never falls back to the snapshot's copy. Verification also fails if a
command fails or changes tracked reviewed content. Ignored build output is discarded with
the disposable workspace and the immutable snapshot is never mutated by verification.

This is isolation for ordinary relative writes, not an operating-system sandbox. A
malicious command can still use absolute paths or external programs, so read the capsule's
validation block before executing work you did not supervise.

**What `--run-tests` executes, and whose trust that is.** It runs the commands declared in the capsule's `task.md` through a shell. Two things follow:

- A review record **cannot** inject a command. Only declared commands are ever executed, so the agent-written record has no path to a shell.
- The capsule **can**. In the normal akrctx flow the primary agent writes the capsule, so `task.md` is agent-authored project content, not a human-authored file.

That is why nothing runs unapproved. The flag requires a snapshot candidate — a `WORKTREE` or commit-ref record is refused, so re-execution never touches the live tree — and before executing anything it asks:

```bash
# terminal: the declared commands are printed and confirmed with y/N
akrctx judge verify .akrctx/local/judge/TASK-001/review.json --run-tests

# headless: reproduce the declared list, one flag per command, in declared order
akrctx judge verify .akrctx/local/judge/TASK-001/review.json --run-tests \
  --approve-commands "pnpm build" --approve-commands "npx vitest run"
```

The order must match what was printed. Order carries no security weight on its own, but requiring it forces you to paste back the list you were shown rather than assemble a plausible one from memory — and that confirmation is the control. The flag repeats instead of taking one comma-separated value because declared commands legitimately contain commas.

So the human, not the capsule, decides what executes. That makes the operator the last barrier: as strong as the attention paid to the list, and no stronger. Read it before approving work you did not supervise.

The gate lives with the primary agent rather than the judge: the judge and the comprehension evaluator are read-only by contract and cannot execute anything. `akrctx judge snapshot --from-review` takes the same flag, because catch-up strongly verifies its parent and that re-runs the same commands.

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

The snapshot integrity check fingerprints every tracked and untracked-but-not-ignored path by its content *and* its change-time (ctime), so a file changed and restored to its original bytes — or a file created and deleted inside a tracked directory — is still reported as a modification after capture, not only a final content mismatch. The inode number is deliberately not part of the fingerprint: on FUSE and some network mounts it is synthesized by the daemon and drifts over time even when nothing changed, which would make an honest snapshot permanently unreviewable. The check does not cover ignored paths (build output, dependencies): a write there is permanent and no integrity check sees it, which is why `--run-tests` materialises dependencies from the lockfile instead of trusting the snapshot's copy. This is tamper-evident bookkeeping, not a sandbox — a determined reviewer with shell access can still damage things akrctx cannot see.

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

The model is configuration, not a file edit. `akrctx upgrade` regenerates the agent files
from `.akrctx/config.json`, so a model added to a generated file by hand does not survive.

```bash
akrctx config set agents.judge.model.claude  <model-id>
akrctx config set agents.judge.model.copilot "<Model Name>"
akrctx config set agents.judge.model.codex   <model-id>
```

The value is written where the host reads it — the `model` frontmatter field for Claude
Code and Copilot, the `model` key for the Codex TOML — and `judge enable`, `doctor`, and
`upgrade` each report which model is in effect per target.

There is one identifier space per host, which is why the setting is per target rather than
a single value.

> Model identifiers are platform-specific and change over time. akrctx validates them by
> shape, never against a list: a list would go stale on every provider release and make a
> new model unusable until akrctx shipped a version that knew about it. An identifier that
> does not match its host's usual shape produces a **warning** and is written to the
> generated file exactly as configured. akrctx does not have the provider's catalogue, so
> refusing an unfamiliar value would block a legitimate new model to catch a typo.

### Claude Code

`agents.judge.model.claude` accepts a model alias (`opus`, `sonnet`, `haiku`, `fable`,
`opusplan`, `default`, `inherit`), a full model name (`claude-opus-5`), or a
provider-specific id — a Bedrock inference-profile ARN, a Foundry deployment name, a Vertex
version name. See [Claude Code model configuration](https://code.claude.com/docs/en/model-config).

### GitHub Copilot

`agents.judge.model.copilot` takes the display-name format, optionally qualified by vendor:
`Claude Opus 4.5`, `GPT-5.2`, `GPT-5 (copilot)`. Quote it — it contains spaces. VS Code also
accepts an array of fallbacks, but the Copilot CLI rejects one
([github/copilot-cli#2133](https://github.com/github/copilot-cli/issues/2133)), so akrctx
writes a single value. See [custom agents in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-agents).

### Codex

`agents.judge.model.codex` takes the model id used in Codex configuration, for example
`gpt-5-codex` or `o3`. See [Codex subagent docs](https://developers.openai.com/codex/subagents).

## Pi

Pi does not have a native subagent API. The judge is not available for Pi targets. `akrctx judge enable` skips Pi automatically.

## Independence and the `independent` field

The judge's value is judgment the implementer cannot self-police. The review record carries an
optional `independent` boolean (absent means `true`). A reviewer who is the same agent or
session that implemented the task, or who runs on a host with no subagent isolation, sets
`independent: false`. This is honesty convention, not cryptographic proof — it makes honest
self-reviewers flag themselves and lets the comprehension gate refuse a flagged approval, but
it cannot stop a determined adversary from lying. It is consistent with the project's stance that
policy is prompt-level.

`akrctx judge verify` reports a non-independent record as a **notice** and does not change
`valid`, `approved`, or the exit code: the mechanical guarantees (re-executed tests, bound
digests) still hold, so the record is still a valid mechanical approval. Independence is a
judgment the comprehension gate enforces — it requires `independent: true` (in addition to
`approved: true` and `judge current` `CURRENT`) and refuses a non-independent approval.

On Pi specifically, a judge run from the same session that implemented is non-independent by
construction: Pi has no agent format, so there is no separate reviewer context. Such a review is
verification-only; for an independent verdict, run the judge from another host (Claude Code,
Codex, or Copilot subagent) or a separate session. The snapshot-based `judge current` check
also requires a snapshot, so a Pi self-review that falls back to `WORKTREE` cannot reach
`CURRENT` and therefore cannot satisfy the comprehension gate even if marked independent.
See `.akrctx/wiki/decisions.md` (2026-08-06, 2026-08-08).

## Project review policy

A project can keep criteria that apply to every task in one place instead of repeating them
in every capsule. Create `.akrctx/review-policy.md` by hand and write it once; `akrctx init`
does not create it, and a repository without the file behaves exactly as it did before.

This file is **not** a replacement for a task capsule's `acceptance-criteria.md`. The
capsule still owns what is true for one task; the review policy owns what is true for every
task. Both the judge and the implementer read `.akrctx/review-policy.md` when it exists and
apply its entries in addition to the capsule criteria. The comprehension evaluator does not
read it — its contract is teaching, not reviewing.

### Bound and precedence

The file may only **add** criteria. It can never relax or override:

- the verdict rules,
- the APPROVED requirements,
- the independence rules,
- the validation-evidence rules, or
- the safety section.

Any text in the file that attempts any of those is ignored and reported as an issue.

A policy criterion never widens a capsule's scope. Work the capsule declares out of scope
stays out of scope even when the policy points at it. If a policy criterion and a capsule
criterion genuinely conflict for one task, the **capsule wins** for that task and the judge
reports the conflict as a non-personal issue. The implementer stops and returns the question
rather than picking a side.

A violated policy criterion is recorded as an ordinary `issues` entry. No new verdict value,
severity field, or record field is introduced, so the existing APPROVED requirement of an
empty `issues` array already covers it.

### Example

```markdown
# Project review policy

## Every task

- All new TypeScript files must include at least one unit test.
- Public API changes update the corresponding README section.
- Dependencies added to `package.json` must be recorded in `docs/dependencies.md`.
```

### Snapshot worktree

For a `SNAPSHOT:<id>` candidate the judge reads `.akrctx/review-policy.md` from the
snapshot worktree, on the same path rule as every other file it reads — never from the live
project.
