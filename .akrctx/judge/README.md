# Judge Enforcement Contract

The trusted caller normally captures `akrctx judge snapshot TASK-XXX --base <ref>` before invoking the judge. Capture creates an immutable ignored local copy without committing, staging, stashing, checking out, creating refs, or changing live files. The private repository is shallow, policy-blocked paths are absent from its reviewable worktree, local Node dependencies are copied instead of linked when present, and `akrctx judge prune --keep <n>` provides dry-run-first retention. The judge then runs `akrctx judge scope TASK-XXX --base <ref> --candidate SNAPSHOT:<id> --json` and copies that exact scope into its review record. Commit and legacy `WORKTREE` candidates remain supported.

Scope and snapshot capture fail closed when changed files include a different task capsule under `.akrctx/tasks/TASK-YYY-*`. The error lists every foreign task ID and path; isolate the worktree or explicitly repeat `--include-task TASK-YYY` on `judge scope` or `judge snapshot`. Explicit inclusions are recorded in `scope.includedTaskIds` and bound to `scopeDigest`; catch-up snapshots preserve the parent's decision. Other changed files remain in the boundary — akrctx does not infer or silently omit source files.

An empty boundary is rejected by `judge snapshot` unless the caller passes `--allow-empty`. That explicit authorization is recorded as `emptyBoundaryAuthorized: true` in the snapshot metadata and scope and is part of the snapshot identity; ordinary snapshots keep it false. The human `SNAPSHOT:<id>` is the immutable capture ID, while a later `<review.json>` is the separate judge verdict record.

Before using an approval, run `akrctx judge verify <review.json> --run-tests`. Verification checks the record shape and recomputes SHA-256 digests for the task capsule and exact code boundary. A snapshot approval remains valid when the live workspace moves; tampering with the snapshot or any catch-up ancestor invalidates it. `akrctx judge current <review.json>` first rejects an invalid or non-approved record, then reports whether live content is `CURRENT`, has `NEWER_CHANGES`, or `DIVERGED`. This binds a verdict to evidence; it does not cryptographically prove which model produced the verdict.

An `APPROVED` verdict additionally requires evidence and coherence:

- at least one entry in `tests` with `status: "passed"` — an approval that ran nothing is not an approval
- `status: "pass"` on every entry in `criteria`, with exactly one entry per `AC-<n>` the capsule declares — a missing or extra identifier fails verification and the error names it
- defects outside the declared criteria belong in `observations`, which never blocks approval

A `failed` entry in `tests` invalidates the record under any verdict. If validation cannot run at all, the correct verdict is `BLOCKED`, not `APPROVED`.

## Criterion identifiers

Every top-level `- ` bullet in the capsule's `acceptance-criteria.md` is one criterion and starts with `AC-<n>: `. Indented lines continue the bullet above them. Identifiers are unique inside one capsule; a missing, malformed, or duplicate identifier is reported with the offending file line and blocks verification. `akrctx task migrate-criteria [TASK-ID]` numbers an older capsule mechanically.

The record reports one `criteria` entry per declared identifier, each with a `status` and non-empty `evidence`. A reference is always the identifier, never a position, so a bullet inserted or reordered between two rounds cannot silently repoint an existing finding. `criteria` is the only blocking channel: a defect the capsule does not declare goes to `observations` and becomes a separate decision instead of a blocker on the current round.

## Declared proof

A criterion can declare expected evidence on indented lines under its own bullet:

```text
- AC-1: The requested behavior is implemented.
  proof-command: pnpm test
  proof-doc: docs/behavior.md#Behavior
```

Only `proof-command:` and `proof-doc:` exist. One reference per line, with a single-line value. Identical repeated references count once. Both are optional, and existing capsules need no change. An empty, orphaned, or unsupported proof line, or a `proof-doc:` that is absolute, uses `..`, is a URL, or matches `blockedReadPatterns`, is a capsule defect reported with its file line. Such a reference is never read or fetched.

A `proof-command:` must match a command in the `## Validation` block of `task.md` after the same trimming and removal of the `# optional` marker. It adds no execution channel: only declared commands ever run. Several `proof-command:` lines on one criterion are all necessary, and a command that is optional for the whole task is necessary for a criterion that names it.

Verification reports three separate texts, which can appear together:

- `proof requirement unmet`: the command is not declared, or the record has no passing evidence for it (absent, `failed`, or `not-run`), or its observed re-run failed. This blocks a claimed pass for that criterion.
- `execution not observed: command accepted on trust`: the record claims the command passed and `--run-tests` did not observe it. This is a notice. The record stays valid under the usual rules. A successful observed re-run removes it.
- `criterion not evaluated`: the record reports `not-evaluated` for a criterion that declares a proof. This never hides an unmet proof.

A passing command is a necessary condition, never a verdict. The judge still decides whether the criterion is satisfied, and the record can report `fail` next to a passing command. A `proof-doc:` only points the judge at repository content, including unchanged files in the boundary. It never gates. A missing document is reported as unavailable, a link that leaves the repository is not followed, and file existence alone proves nothing. The record shape does not change, and akrctx does not read per-test results from reporter output.

`akrctx judge verify` also reads a stored schema version 5 record, which carried a free-form `issues` list. Such a record is verified under the version 5 rules, reported as legacy, and never emitted again.

When the capsule's `task.md` declares commands in a fenced block under `## Validation`, every required command — any non-empty line not starting with `#` and not suffixed `# optional` — must pass for `APPROVED`. A line suffixed `# optional` may fail; that is reported as a warning and does not block approval. At least one declared command must still be the passing entry in `tests`; a judge cannot satisfy the evidence rule with a command it invented, even when every declared command is optional. A single `no-runtime-validation: <reason>` line inside the fence declares no runtime validation; it requires a non-empty reason and zero commands, and does not claim any code was verified. A capsule with no `## Validation` section is legacy: verification reports `verifiedNow: unknown`, but the record's historical `approved` verdict can still stand.

## Independent re-execution

`akrctx judge verify <review.json> --run-tests` re-runs the capsule-declared commands the record claims passed, instead of trusting the claim. It requires a snapshot candidate — a `WORKTREE` or commit-ref record is refused — and it never executes without operator approval: the CLI prints the declared commands and asks in a terminal, or requires `--approve-commands` once per command in declared order when headless. Commands run in a disposable copy outside the live project whose dependencies are materialised from the committed lockfile, not inherited from the snapshot's private copy, so re-execution rests on the lockfile rather than on bytes inside the reviewed artifact; if the boundary declares dependencies but has no lockfile, or the install fails, verification fails with a named reason and never falls back to the snapshot's copy. The disposable copy cannot corrupt the immutable snapshot through ordinary relative writes. Verification still fails if validation rewrites tracked content. This is process isolation for normal tooling, not an OS sandbox for an intentionally malicious command with absolute paths.

Run it from the trusted caller, before any handoff. The judge runs its own declared validation in a disposable copy but must not pass this flag to verify its own record. The comprehension evaluator checks the record without executing validation.

## What this does and does not prove

It proves the verdict is bound to a specific task capsule and code boundary, that the boundary still matches the repository, and — with `--run-tests` — that the declared validation really passes and left the boundary intact.

The snapshot integrity check fingerprints every tracked and untracked-but-not-ignored path by its content *and* its change-time (ctime), so a file changed and restored to its original bytes — or a file created and deleted inside a tracked directory — is still reported as a modification after capture, not only a final content mismatch. The inode number is deliberately not part of the fingerprint: on FUSE and some network mounts it is synthesized by the daemon and drifts over time even when nothing changed, which would make an honest snapshot permanently unreviewable. Ignored paths are normally outside this manifest; fixed generated artifacts explicitly registered by snapshot capture are the exception and carry separate content and write-integrity digests. Dependencies remain untrusted, which is why `--run-tests` materialises them from the lockfile instead of trusting the snapshot's copy. This is tamper-evident bookkeeping, not a sandbox — a determined reviewer with shell access can still damage things akrctx cannot see.

It does not prove which model produced the verdict. The judge is read-only by design, so a trusted caller writes the record, and that caller could in principle write one the judge never produced. Nothing in this repository can close that gap. The mitigation is human: the judge's prose review appears in the session transcript, and the developer reads it. Treat a verified record as tamper-evident bookkeeping, not as an unforgeable signature.

`--run-tests` narrows that gap without closing it. A review record can never inject a command, because only declared commands run. The capsule itself is normally written by the primary agent, so the declared commands are agent-authored project content — which is why the approval prompt exists: the human, not the capsule, decides what executes. That makes the operator the last barrier rather than a compromised primary agent, but it is only as strong as the attention paid to the list. Read it before approving work you did not supervise.

## Withheld paths

Files matching `blockedReadPatterns` in `policy.json` are excluded from the diff and listed by path in `scope.excludedPaths`. Their contents are never read or fingerprinted. The path list is part of the boundary digest, so a secret appearing or disappearing still invalidates a stale approval. A judge that cannot review meaningfully without those files should report `BLOCKED`.
