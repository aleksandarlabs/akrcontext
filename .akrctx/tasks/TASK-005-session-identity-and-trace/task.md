# TASK-005

## Goal

Phase 1 of the "contract as mechanism" plan: make it possible to answer, with data,
whether the harness contract was honored in a given session — without blocking anything,
injecting anything, or changing what the user sees.

Two things have to exist that do not today:

- **Session identity.** Every predicate about "this session" needs a session ID and the
  repository state the session started from. All three hook hosts supply a session ID in
  the payload, so it is captured, not invented.
- **A session trace.** An append-only record of what the agent actually did, from which
  the contract predicates are derived offline.

This is also a build requirement for phase 3, not only measurement: the blocking
predicate needs session identity to resolve *which* capsule is active.

## Recommended Workflow

SDD+TDD

## Workflow Notes

- Workflow source: `.akrctx/config.json` `workflowRules.apiOrContract` is `SDD+TDD`, and
  this task defines two contracts consumed by things I cannot change — the payload shapes
  three vendors send, and a trace record other commands will read.
- Why this workflow: the normalization contract and the record schema have to be written
  down before implementation, because getting them wrong is expensive to undo once traces
  exist on disk. Then each clause becomes a test.
- Context loaded: `src/judge-enforcement.ts` (digest, git, blocked-pattern helpers to
  reuse), `src/cli.ts` (command wiring), `src/harness-files.ts`, `src/config.ts`,
  `src/task.ts` (`findTaskDirectory`), `src/comprehension.ts` (local-ignore handling),
  `src/manifest.ts`. Verified vendor docs for Claude Code, Codex, Copilot and Pi.

## Contract

### Host payload → normalized event

Accept both payload dialects, because Copilot emits snake_case under VS Code-compatible
event names and camelCase otherwise, and never fail on an unknown shape:

| Normalized      | Accepted keys                                    |
|-----------------|--------------------------------------------------|
| `sessionId`     | `session_id`, `sessionId`                         |
| `event`         | `hook_event_name`, argv event name                |
| `cwd`           | `cwd`                                             |
| `toolName`      | `tool_name`, `toolName`                           |
| `toolInput`     | `tool_input`, `toolArgs`, `input`                 |
| `source`        | `source`, `reason`                                |

Events normalize to: `session-start`, `pre-tool`, `post-tool`, `stop`, `session-end`.
Unrecognized events normalize to `other` and are recorded, not rejected.

### Failure contract

The hook binary must **never** exit non-zero and must **never** hang. On Copilot a
non-zero exit from `preToolUse` denies the tool call, so a crashing hook would block every
tool call in the session; a hang is fail-open there but wastes the host's timeout budget.
Every path — unreadable stdin, malformed JSON, unwritable trace, missing config — exits 0
with no decision.

### Trace record

`.akrctx/local/traces/<sessionId>.jsonl`, append-only, one JSON object per line. Line 1 is
the header written at `session-start`; every later line is an observation. Append-only
JSONL rather than a rewritten JSON document, because the hot path runs on every tool call
and must not read-modify-write a growing file.

Observations record *what happened*, not verdicts. Predicates are derived at report time
by replaying the stream, so the hot path never scans the task directory.

## Validation

Commands that prove this task works. The judge must run at least one of these to
approve, and `akrctx judge verify --run-tests` re-runs the ones the review claims
passed. Nothing outside this list is ever executed.

```
pnpm test
pnpm lint
```

## Out Of Scope

- Any blocking. Phase 1 emits no decision on any event, on any host.
- Any context injection. That is phase 2.
- Reanchoring after compaction. That is phase 4.
- The conformance suite. Support levels stay undeclared until it exists; this task must
  not add a hand-written support table, which would be the prose problem again.
- Making the `enforcement.*` booleans real. That is phase 3 and depends on this.
- Manifest drift verification in doctor, and the two known weak spots recorded in
  TASK-004 (`setConfigValue`'s codex fallback, `getInstalledTargets`).

## Open Questions

- Whether Copilot really emits snake_case under VS Code-compatible event names is taken
  from its published reference, not from execution. The normalizer accepts both shapes so
  the answer does not change the code, but the support level stays unverified until a
  conformance run says otherwise.
