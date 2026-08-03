# Acceptance Criteria

## Failure contract — the one that must not break

- AC1. `akrctx hook <event>` exits 0 for every input: valid payload, malformed JSON, empty
  stdin, unknown event name, a repository with no akrctx installed, and an unwritable
  trace directory. There is no input that makes it exit non-zero.
- AC2. It emits no permission decision on any event in phase 1. Stdout is either empty or
  an object carrying no decision field, so a host that reads stdout falls through to its
  normal handling.
- AC3. It completes well inside the tightest host budget. Asserted against a measured
  bound, not a claim.

## Normalization

- AC4. Both payload dialects normalize identically: `session_id`/`sessionId`,
  `tool_name`/`toolName`, `tool_input`/`toolArgs`/`input`.
- AC5. The event name comes from the payload when present and from argv otherwise, so a
  host that omits `hook_event_name` still produces a correctly typed observation.
- AC6. An unrecognized event is recorded as `other` rather than dropped or rejected.
- AC7. A payload with no session ID is recorded under a stable synthetic ID rather than
  discarded, so a host that omits it still produces usable data.

## Trace

- AC8. `session-start` writes a header line carrying schema version, CLI version, session
  ID, host, start time, the `source` the host reported, and the base commit — or records
  that there is no commit, without failing, in a repository with no git history.
- AC9. Later events append one line each. The file is valid JSONL: every line parses
  independently, and no line is ever rewritten.
- AC10. Observations record what happened, not verdicts. Nothing in the hot path reads
  `.akrctx/tasks/`.
- AC11. Tool inputs are recorded as classified paths and command shape, never as raw
  content, and any path matching `policy.blockedReadPatterns` is recorded as withheld —
  by pattern, never by content. The trace must not become a way to leak what the blocked
  read rules exist to protect.
- AC12. Traces live under `.akrctx/local/`, which the existing ignore rule already covers,
  so nothing lands in version control.

## Report

- AC13. `akrctx trace report` replays the traces and answers, per session: was a capsule
  bound, was it bound before the first mutation outside `.akrctx/`, was the bound capsule
  complete, was validation declared, was a declared command observed running, and was a
  blocked path touched.
- AC14. It reports **both** candidate definitions of "active capsule" — bound by
  observation, and created before the first mutating write — because phase 3 has to choose
  between them on evidence rather than on argument.
- AC15. It degrades honestly: a truncated or partly corrupt trace yields a result marked
  incomplete for that session rather than a wrong aggregate or a crash.
- AC16. `--json` emits machine-readable output for the two-week measurement.

## Installation

- AC17. `akrctx trace enable` writes the host hook configuration for installed targets and
  is idempotent. `disable` removes only what akrctx added. `status` reports what is wired.
- AC18. Enabling never overwrites unrelated user configuration in a shared settings file;
  existing hooks and unrelated keys survive.
- AC19. Tracing is opt-in and off by default. Installing or upgrading akrctx does not
  start recording.
- AC20. No support-level table is added anywhere. Where a host is wired but unverified,
  that is what `status` says.

## Added after review

- AC23. No reported rate can exceed its denominator. The contract predicates are counted
  over the sessions the contract applies to — those that changed something outside
  `.akrctx/` — because that is what the rate is reported against.
- AC24. "The first mutation outside `.akrctx/`" means what it says: a harness edit such as
  `CLAUDE.md`, or a write beyond the repository, counts. Only writes inside `.akrctx/` are
  exempt, since those are harness bookkeeping rather than the work the contract governs.
- AC25. `trace disable` removes the Pi extension rather than reporting a removal it did not
  perform, and `trace status` reflects the result.
- AC26. The wired command cannot itself exit non-zero, for any reason, on any host.
  `runHook` being total is not enough: a bare PATH invocation can resolve to a build with
  no `hook` subcommand, where the argument parser exits 1 before `runHook` is reached — and
  on Copilot that denies every tool call. Stated as the property rather than as a
  mechanism, on the judge's point that the earlier wording mandated one implementation of
  it.
- AC27. Enabling and disabling identify akrctx's own entries by something no other tool
  can accidentally emit. Recognizing them by the shape of the invocation is not enough:
  passing the event name as an argument is the convention akrctx itself chose, so a peer
  tool that ends a command with `hook <Event>` must survive both enable and disable
  untouched. A bare `akrctx hook <Event>` resolved from PATH is also adopted, so an entry in
  that form is replaced rather than stacked beside a new one.

  No claim is made here about which forms exist in the wild, because none do: akrctx has
  never released, tagged or committed any hook wiring, so every historical shape is an
  artifact of one round of this task. The bare form is recognized because it costs a single
  pattern and also covers an entry a human might reasonably write by hand. The
  pinned-without-marker shape gets no branch because nothing outside this task ever emitted
  it. That asymmetry is a cost-and-usefulness judgment, not a released-versus-unreleased
  distinction — an earlier wording of this criterion asserted the latter, which was false.

## Added after human review

Six defects found by the developer that neither the original criteria nor four rounds of
independent review caught. Four of them falsified criteria that were already marked met.

- AC28. The **binary** exits within the tightest host budget, not just `runHook`. Resolving
  the read promise is not enough: an open pipe keeps the event loop alive, so the process
  outlives the promise. Measured against the real binary with a pipe that is never closed.
- AC29. A shell command contributes **no arguments** to the trace — only the executable
  name, and only when it is a plain name. `echo <secret>` must not put the secret in the
  record, and `cat .env` must not put the path there.
- AC30. Blocked paths are detected inside shell commands too. A shell command never reaches
  the file-path classifier, so the blocked-read screen has to look at the command line.
- AC31. The rates describe what happened, not what was requested. A write counts only when
  the host reported it completed; a rejected or failed attempt does not. Where the effect
  cannot be known — any shell command, or attempts with no outcome ever reported — the
  session is marked uncertain and held out of the rates rather than guessed either way.
- AC32. The trace header records which host produced the session, supplied by the installer,
  which is the only party that knows.
- AC33. Enabling never destroys a settings file it cannot merge. "Absent" and "present but
  unparseable" are different, and the second one aborts without writing.
- AC34. Pi's extension pins the interpreter and entry point like every other host. Pi
  ignores the child's exit code, so a stale binary there fails silently while `status` still
  reports it wired — worse for a measurement feature than failing loudly.

## Added after the second human review

- AC35. An attempt is settled only by the outcome of the **same call**, correlated by the
  host's tool-call id. Where a host sends no id, an outcome for the same tool settles it, and
  an attempt with no matching outcome at all stays open. Anonymous calls preserve
  multiplicity: one outcome settles at most one attempt, and overlapping calls whose
  ordering cannot be reconstructed are held out rather than paired by invention.
- AC36. Every usable session lands in exactly one of three buckets: counted in the rates,
  held out as unclassifiable, or observed to change nothing and unable to have changed
  anything. A session that changed something, or might have, can never fall out of the first
  two — and the held-out count is printed, not merely carried in `--json`, or "held out
  honestly" describes the data structure rather than the report.

  The third bucket is deliberate and was missing from an earlier wording of this criterion,
  which claimed every session is in one of two. Read-only sessions are neither compliant nor
  suspect; folding them into either would distort the rate. The test asserted `<=` and so
  proved nothing — it now partitions all three and checks they sum exactly.
- AC37. A trace with no header, or holding a record missing its essential fields, is
  incomplete. Only well-formed lines make a trace whole.
- AC38. Only a genuinely missing file counts as absent when merging host configuration. An
  empty file, an unreadable one, and a permission error are all "present but unmergeable"
  and abort without writing.

## Added after the third human review

- AC39. Every host reports call ids and outcomes, or its writes can never leave `uncertain`.
  Pi must listen to `tool_result` and carry `toolCallId` on both events; Copilot must wire
  `postToolUseFailure`, since a failed call never reaches `postToolUse` there.
- AC40. A session with no recorded end **after its latest start** is incomplete. It is either
  still running or was killed, and its missing half would read as a capsule that was never
  bound. A resumed session cannot reuse a `SessionEnd` from its previous lifecycle.
- AC41. Whether a tool writes is a property of the tool, never of whether this payload
  happened to carry a path in a recognized shape. A write with an unclassifiable target is
  held out as uncertain — never dropped from both buckets. A failure settles its call and is
  not a doubt: nothing changed, wherever it was aimed. Uncertainty is derived after matching
  the outcome, so a pathless failed attempt does not leave an irreversible session-wide flag.
- AC42. Only a `post-tool` outcome settles an attempt. Sharing a call id is not enough, and
  an unrecognized event never becomes a successful mutation merely because it names a
  mutating tool.

## Cross-cutting

- AC21. `pnpm test` and `pnpm lint` pass.
- AC22. No change to judge approval rules, the comprehension gate, protected-file merge,
  or the phase-3 `enforcement.*` booleans.
