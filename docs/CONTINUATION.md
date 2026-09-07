# Portable continuation records

`akrctx task continuation TASK-001 [--json]` reads a task's optional `continuation.json`.
The record travels with the repository if you commit it. The command does not create, update,
import or migrate records, resume work, or run commands. Existing tasks need no new files.

## What the result means

| `status` | Meaning | Exit code |
| --- | --- | --- |
| `missing` | The task exists but has no sidecar. Execution is `unknown`, not “never started”. | 0 |
| `valid` | The record satisfies schema v1 and names the requested task directory. | 0 |
| `invalid` | The sidecar exceeds the size limit or contains invalid UTF-8, JSON or schema data. | 1 |
| `unsupported` | The JSON declares another integer schema version. It is not interpreted. | 1 |

Invalid task IDs, duplicate or missing task directories, blocked paths, symlinks, non-regular
files and other filesystem/policy errors fail explicitly. They are not presented as a missing
legacy record. The command reads at most 64 KiB plus one byte to detect an oversized sidecar.

JSON results contain `taskId`, `path`, `status`, `executionState`, `permission`, `verification`,
`continuationDigest`, `record` and `reasons`. `record` and `continuationDigest` are null unless
status is `valid`. The digest hashes the original sidecar bytes; whitespace changes it.

**Valid is structural, not verified or authorized.** `permission` and `verification` always
remain `not-evaluated`. `executionState` is the producer's declaration. In particular, a persisted
`active` state does not authorize or restart a process. The reader does not compare the declared
capsule digest or code content with the current workspace.

Snapshot `availability: "verified"` and validation summary `status: "complete"` are also
producer declarations. They do not establish who ran tests or whether the results apply now.
The reader never executes a command found in a record.

## Minimal v1 example

For `.akrctx/tasks/TASK-001-example/continuation.json`:

```json
{
  "schemaVersion": 1,
  "task": {
    "taskId": "TASK-001",
    "capsulePath": ".akrctx/tasks/TASK-001-example",
    "capsuleDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "capsuleRevision": { "gitCommit": null }
  },
  "latestExecution": null,
  "history": []
}
```

The repeated `a` digest is an illustrative placeholder with a valid shape, not evidence of a
real capsule revision. A producer must supply the actual digest. The directory and ID must match
the task being queried. No five-file migration or automatic execution initialization occurs.

## Execution fields

When `latestExecution` is not null it contains these required fields:

| Field | Value |
| --- | --- |
| `runId` | `run_` plus 1–80 ASCII letters, digits, `_` or `-`. |
| `state` | `planned`, `ready`, `active`, `blocked`, `handoff-requested`, `completed`, `abandoned`, `superseded`. |
| `workspace` | `gitRemote` (a non-sensitive label or `unknown`), `commit` (null or Git hash), `content`. |
| `owner` | `kind`: `orchestrator` or `manual-session`; `id`: label or `unknown`. |
| `model` | `requested` and `observed` strings; use `unknown` for information not provided. |
| `progress`, `blockers`, `decisionsPending` | Arrays of short summaries. |
| `attempts` | Portable budget declaration described below. |
| `validationSummary` | Declared command outcomes described below. |
| `resumption` | `requiresReauthorization` must be true; a non-empty `reason` is required. |

`workspace.content` is either `{ "kind": "unavailable" }` or an object with `kind:
"judge-snapshot"`, `snapshotId`, `reviewContentDigest` and `availability` (`verified` or
`unavailable`). Snapshot IDs start with `SNAPSHOT:` followed by 1–128 ASCII letters, digits,
`_` or `-`. `reviewWorkspaceDigest` is deliberately not a portable field: filesystem integrity
of a particular local snapshot is different from content identity across checkouts.

`attempts` contains `budgetAccountId` (`budget_` plus 1–80 identifier characters), `consumed`
(a non-negative safe integer or `unknown`), `limit` (a positive safe integer), `provenance`
(`portable-summary`, `legacy-local-log`, `unknown`) and `localReconciliation`
(`not-available`, `reconciled`, `conflict`). A count above the limit is retained as exhausted
history, not silently clamped. Reading without local logs neither resets the budget nor
corroborates it. Reconciliation and reservation are separate future operations.

`validationSummary` contains `contractDigest`, `codeReviewContentDigest` (digest or null),
`required` (an array of `{ "command": "…", "status": "passed|failed|not-run" }` objects),
and `status` (`unknown`, `incomplete`, `complete`, `not-applicable-to-runtime`). The notation
`passed|failed|not-run` lists alternatives; choose one in a real record.

A structurally `complete` summary needs a code content digest and at least one required command,
all marked `passed`. `not-applicable-to-runtime` requires an empty required-command list and
an additional non-empty `reason`. No other status accepts `reason` in that object.

`history` contains at most 20 execution objects, all in terminal states (`completed`, `abandoned`,
`superseded`). Run IDs must be unique and differ from the latest execution. Oversized history
is rejected, never truncated on read.

## Limits, privacy and compatibility

Schema v1 rejects unknown fields at every object level. Free strings are at most 1,024 characters;
ordinary arrays are at most 100 entries. Digests use `sha256:` plus 64 lowercase hexadecimal
characters. Git commits are null or 40/64 lowercase hexadecimal characters. Numbers and enums
are not coerced from strings or arrays.

The sidecar should contain only non-sensitive summaries. Do not put transcripts, raw logs,
credentials, private URLs, grants or personal comprehension answers in it. Closed schema objects
prevent adding arbitrary permission/log fields, but cannot detect secrets embedded in free text.
Producers are responsible for reviewing what they make portable. JSON output includes the valid
record; terminal output shows only structural status and reasons.

This initial reader does **not** change judge or snapshot rules. Until the separate review-boundary
integration is implemented, `continuation.json` still participates in the existing code-change
boundary like other repository files. Do not assume updating it preserves a current approval.
The five canonical capsule documents and their digest calculation are unchanged.
