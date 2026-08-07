# TASK-008

## Goal

Ship an implementation agent as a first-class akrctx artifact, alongside the judge, and
give it the on-disk backing the judge already has.

The problem is not that hosts lack an implementation agent. It is that a delegated agent
starts with a fresh context window, receives whatever the orchestrator chose to
summarise, and returns without leaving durable state. Every round loses information, and
nothing carries across invocations — so a rule like "stop after three attempts" cannot
hold, because the fourth instance has no way to know it is the fourth.

akrctx already solved the equivalent problem for review: the judge is trustworthy because
its contract lives in the CLI (`judge scope`, `judge verify --run-tests`, immutable
snapshots), not in its prose. This task applies the same shape to implementation. The
agent definition is the delivery vehicle; `akrctx impl` is the contract.

## Recommended Workflow

SDD+TDD

## Workflow Notes

- Workflow source: `.akrctx/config.json` `workflowRules.apiOrContract` is `SDD+TDD`.
- Why this workflow: the round record format, the attempt counter, and the guarantee that
  implementation logging never moves `taskDigest` are contracts consumed by three
  generated agent definitions and by a human reading `impl status`. Fix the contract
  first, then encode it as failing tests.
- Research-first discovery was completed before this capsule: `capsuleFiles` is a
  five-entry typed constant feeding `taskDigest`; `judge scope` filters the diff only by
  `blockedReadPatterns`; `.akrctx/local/.gitignore` ignores `*`; and the judge emits to
  `.claude/agents/*.md`, `.github/agents/*.agent.md`, and `.codex/agents/*.toml`.

## Contract

### Where implementation state lives

- The implementation log is `.akrctx/local/impl/<TASK-ID>/log.md`.
- That path is already ignored by `.akrctx/local/.gitignore`, so the log never enters a
  review boundary. It is absent from `scope.changedFiles`, and because `capsuleFiles`
  stays at five entries it is absent from `taskDigest`.
- This placement is load-bearing, not incidental. A log inside the capsule would be a
  tracked file in the diff, which would make the implementing agent's own account of its
  work readable by the judge as evidence — the one thing the judge contract forbids.
- The five capsule files remain the only task specification. The implementer reads them
  and never writes them.

### The `akrctx impl` commands

- `akrctx impl start <taskId>` opens or resumes the log and reports the round number the
  caller is entitled to begin, or refuses when the attempt budget is spent.
- `akrctx impl log <taskId>` appends one structured round record. Records are append-only;
  the command never rewrites or deletes an earlier round.
- `akrctx impl log` enforces the attempt budget too, and refuses to append beyond it. The
  budget is an invariant of the store, not a courtesy of the opening command: a caller that
  skips `start` must not thereby escape the limit that `start` exists to apply.
- The round number is always derived at append time from the persisted records. `start`
  reports it, but does not reserve or issue it, so two `start` calls with no `log` between
  them cannot disagree about what the next round is.
- One record is written with a single atomic append. Concurrent writers are not otherwise
  serialised: a task has one implementing agent at a time, and a lock would add a failure
  mode the design does not need.
- `akrctx impl status <taskId>` reports attempts used, attempts remaining, the last
  blocker, and whether the task is stopped. `--json` carries the machine-readable form.
- The attempt counter is derived from the persisted records, not supplied by the caller.
  An agent cannot report a lower round than the log proves, and a fresh instance reads the
  true count rather than assuming it is the first.
- The default attempt budget is three, read from `agents.implementer.maxAttempts`.
  TASK-009 defines, validates, and defaults that key; this task consumes it rather than
  reintroducing a constant. Both tasks land on the same branch, in that order.
- A round record carries: round number, timestamp, criteria targeted, files changed,
  each validation command with its verbatim result, blocker, and decision needed.
- Malformed or truncated log content is reported as such rather than silently parsed as
  zero attempts. A log that cannot be trusted must not grant a fresh budget.

### How the implementer is enabled

- The implementer is opt-in through `akrctx impl enable`, exactly as the judge is opt-in
  through `akrctx judge enable`. The command writes the agent files for every installed
  target that has a format, then persists the intent as `agents.implementer.enabled` in
  `.akrctx/config.json`.
- Rewritten against TASK-009. The intent was originally to be persisted as `impl.enabled`,
  a new optional key. TASK-009 makes `agents` the canonical shape and maps `impl.enabled`
  onto `agents.implementer`, so this task writes the canonical key and adds no schema of its
  own. `impl.enabled` stays readable for any configuration that already carries it.
- The entry is optional. A configuration written before either task loads unchanged and
  behaves as it did: absent means off, and `akrctx init` alone never writes an implementer
  agent.
- `akrctx upgrade` regenerates the agent files only when the implementer resolves to
  enabled. Without a persisted flag, upgrade would have to guess whether a missing file
  means "not wanted" or "deleted by accident", and the judge already solved this by
  recording the intent.
- The per-target model and the emission targets come from `agents.implementer` like every
  other agent. This task adds no configuration of its own.
- Doctor reports the same shape of gap the judge reports: when the implementer is enabled
  and an agent file is absent, it says so and names `akrctx impl enable`. The files are not
  added to the per-target required lists, because those are unconditional and this is not.

### The implementer agent definition

- akrctx generates an implementer agent for the same three host formats the judge uses:
  `.claude/agents/akrctx-implementer.md`, `.github/agents/akrctx-implementer.agent.md`,
  and `.codex/agents/akrctx-implementer.toml`.
- Hosts differ in how they invoke a delegated agent. The generated instructions describe
  the contract and the artifacts; they never assume a specific host's subagent mechanism.
- The agent reads, before writing code: `acceptance-criteria.md` as its spec, `task.md`
  for scope and clarifications, `plan.md` for the declared workflow that governs ordering,
  `context.md`, and the full existing log.
- It runs exactly the commands in the fenced `## Validation` block of task.md. Those are
  the commands the judge must run and that `judge verify --run-tests` re-executes; a
  command the agent invented is not evidence.
- On ambiguity it stops and returns the question to the caller. It does not write to
  `task.md`, because `task.md` feeds `taskDigest` and a write after `judge scope` would
  invalidate the boundary. Recording the answer under `## Clarifications` or
  `## Open Questions` stays with the lead, where the human is.
- It never writes protected instruction files. Approval for those requires a human in the
  conversation, and a delegated agent does not have one.
- It is never invoked automatically by the CLI.

### What this task does not claim to fix

- Per-agent permission enforcement. A host's permission rules are session-scoped, and no
  subagent definition accepts a deny list. akrctx can state the boundary; it cannot impose
  it. The generated instructions say so plainly rather than implying protection.

## Validation

Commands that prove this task works. The judge must run at least one of these to
approve, and `akrctx judge verify --run-tests` re-runs the ones the review claims
passed. Nothing outside this list is ever executed.

```
pnpm build
pnpm test
pnpm lint
```

## Out Of Scope

- The `agents` configuration block itself, the per-target model rendering, and the
  warning policy for models and triggers. TASK-009 owns all of it and lands first on the
  same branch; this task consumes `agents.implementer` and adds no configuration key.
- Stable acceptance-criteria IDs (`AC-N`) in the capsule template.
- Automatically invoking a host-specific agent from the cross-host CLI.
- Changing `capsuleFiles`, `taskDigest`, or any judge snapshot behaviour.
- Enforcing agent behaviour through host permission rules.

## Clarifications

### Session 2026-08-06

- Q: Does the attempt counter and implementation log get CLI backing, or is it a disk
  convention the agent follows by instruction? / A: CLI backing (`akrctx impl`). A counter
  that only exists as prose is the failure this task exists to fix; the count must be data
  derived from persisted records.
- Q: Should the forthcoming agents configuration block replace the existing `judge` and
  `comprehensionGate` keys? / A: No breaking changes. Existing keys keep working. A shared
  shape may be adopted where it fits, but no existing configuration may stop working.
- Q: Does this task ship before or after the agents configuration? / A: After, on the same
  branch, so the two can be exercised together. That moved this task's boundary: the
  attempt budget is read from `agents.implementer.maxAttempts` rather than kept as a
  constant, and the opt-in flag is `agents.implementer.enabled` rather than a new
  `impl.enabled` key. `impl.enabled` remains readable for configurations that carry it.
- Q: Which host formats does the generated implementer target? / A: The same three the
  judge already emits — Claude Code Markdown, GitHub agent Markdown, and Codex TOML.
- Q: Is the implementer emitted unconditionally by `akrctx init`, or gated? / A: Gated,
  enabled the same way as the judge and the comprehension agent — an explicit
  `akrctx impl enable`. That command persists the intent, so `akrctx upgrade` knows whether
  to regenerate; the judge does exactly this and the reason carries over. With TASK-009
  landing first, the persisted intent is `agents.implementer.enabled`, so this task adds no
  configuration key at all.
- Q: By what mechanism does Doctor account for the implementer files? / A: The same one it
  uses for the judge — a gap check that fires when the feature is enabled and the files are
  missing, not an entry in the unconditional per-target required lists. Chosen for the
  least ceremony consistent with an opt-in feature; requiring the files always would
  contradict the gate.
- Q: What stops a caller from skipping `impl start` and appending past the attempt budget?
  / A: `impl log` enforces the budget itself and refuses the record. The limit belongs to
  the store, not to the opening command.
- Q: How are concurrent writes to one log handled? / A: They are not serialised beyond a
  single atomic append per record. One task has one implementing agent; a lock would add a
  failure mode for a case the design does not produce.

## Open Questions

- Can a host hook distinguish a delegated agent from the lead session, so that writes to
  protected instruction files and capsule files could be blocked mechanically for the
  delegated agent only? Verifying this requires inspecting the hook payload during a real
  delegated invocation, which was not done. Until answered, the boundary stays prose and
  the generated instructions must not imply mechanical protection.
- Should `akrctx impl status` be readable by the judge as review context, or does exposing
  the implementing agent's own account to the reviewer reintroduce the evidence
  contamination this task removes? The log is outside the review boundary by construction;
  whether a reviewer may opt into reading it is undecided.
