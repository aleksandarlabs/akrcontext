# Review Checklist

- [x] Goal is clear.
- [x] Scope boundaries are explicit.
- [x] Relevant files were inspected.
- [x] Secrets and blocked paths were avoided.
- [x] Tests or validation commands were run or documented — `pnpm test` 293 passed
      (66 new in `tests/hook.test.ts`), `pnpm lint` clean.
- [x] Existing instruction files were not overwritten.
- [x] The hook binary cannot exit non-zero on any input — 11 hostile inputs are
      parametrized over two assertions each, plus the CLI-level exit-code test.
- [x] No permission decision is emitted on any event.
- [x] Nothing in the hot path reads `.akrctx/tasks/` — pinned by a test that deletes the
      tasks tree and asserts a pre-tool observation still records.
- [x] Tracing is off unless explicitly enabled — verified on this repository:
      `akrctx trace status` reports disabled, nothing wired.
- [x] No hand-written support-level table was introduced.

## Acceptance criteria status

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | met | `hook failure contract` — 11 hostile inputs × "survives without throwing" |
| AC2 | met | Same inputs × "emits no permission decision"; `HookResult.decision` is typed `undefined` |
| AC3 | met | "stays well inside the tightest host budget" — measured per call over 20 iterations, bound 50ms against Claude's 1.5s shared SessionEnd budget |
| AC4 | met | "normalizes the camelCase dialect to the same shape" asserts deep equality with the snake_case result |
| AC5 | met | "takes the event from argv when the payload omits it" / "prefers the payload event name over argv" |
| AC6 | met | "records an unrecognized event as other rather than dropping it" |
| AC7 | met | "falls back to a stable synthetic session id"; keyed on `process.ppid` |
| AC8 | met | "writes a header line at session start", "captures the base commit when the repository has history", "records no commit rather than failing…" |
| AC9 | met | "appends one independently parseable line per event" |
| AC10 | met | "does not read the tasks directory on the hot path" |
| AC11 | met | "never records raw tool input content", "records a blocked path as withheld…". No path is written to a trace at all — verified end to end, the trace holds only `area`, `capsuleId`, `mutating`, `blocked` |
| AC12 | met | Traces live under `.akrctx/local/`, whose `.gitignore` is `*` + `!.gitignore` |
| AC13 | met | `trace report` block; verified end to end on two simulated sessions |
| AC14 | met | "separates the two candidate definitions of an active capsule" — two sessions that both bind a capsule, only one before mutating |
| AC15 | met | "excludes a truncated session from the aggregate instead of guessing"; `Trace.complete` |
| AC16 | met | `--json` on `trace report` |
| AC17 | met | "is idempotent", "removes only what akrctx added", `trace status` |
| AC18 | met | "preserves unrelated settings and existing hooks" — plants `model`, `permissions` and a foreign hook, asserts all three survive |
| AC19 | met | "is off until explicitly enabled"; `defaultConfig` never sets `trace` |
| AC20 | met | "reports non-dogfooded hosts as unverified rather than as supported" |
| AC21 | met | `pnpm test` 293 passed, `pnpm lint` clean |
| AC22 | met | No change to judge, comprehension, protected-file merge, or the `enforcement.*` booleans |

## Review round 2

All four findings confirmed and fixed. Record:
`.akrctx/local/judge/TASK-005-2026-08-03T070500Z.json` — NEEDS_CHANGES, verified authentic
and current by `akrctx judge verify --run-tests` (no drift; both commands re-executed green).

1. **Incoherent rates (AC23).** `runTraceReport` counted predicates over every complete
   session while the CLI divided by the mutating sessions, producing "150% of mutating".
   Predicates are now counted over the governed sessions themselves. Reproduced the
   judge's four-session scenario: 4 recorded, 2 mutating, `capsule bound 1 (50%)`.
   `blockedPathTouched` stays counted over all sessions and is reported as a count, since
   a blocked read matters whether or not the session changed anything.
2. **`capsuleBeforeFirstMutation` too narrow (AC24).** `Area` gained a distinct `akrctx`
   value so `.akrctx/` and non-`.akrctx/` harness files stop sharing one classification,
   and the predicate now trips on `harness`, `project` and `outside` via `governedAreas`.
   Verified: a session that edits `CLAUDE.md` before binding reports
   `capsuleBeforeFirstMutation: false`; one that edits `.akrctx/wiki/` first still reports
   true.
3. **Pi disable (AC25).** `unwireTarget` now deletes the extension. Verified end to end:
   present after enable, absent after disable, and `trace status` no longer lists pi.
4. **The wired command could exit non-zero (AC26).** The sharpest finding, and outside
   what the original criteria covered: `runHook` is total, but commander exits 1 for an
   unknown subcommand, so a stale `akrctx` on the agent's PATH denies every tool call on
   Copilot before `runHook` runs. The interpreter and entry point are now pinned
   absolutely via `resolveCliEntry()`. Verified the emitted command is
   `"<abs node>" "<abs dist/index.js>" hook PreToolUse`.

Fixing (4) exposed a second defect in the same area: entries were recognized by the
substring "akrctx", which the pinned absolute path need not contain — this repository lives
in `akrcontext`, which does not. Idempotency and `trace status` both broke. Recognition now
anchors on the shape of the invocation (a command ending in `hook <Event>`), which also
survives the repository being moved.

## Review round 3

Record: `.akrctx/local/judge/TASK-005-2026-08-03T073500Z.json` — NEEDS_CHANGES, verified
authentic and current by `akrctx judge verify --run-tests` (no drift, both commands green).
Three of the four round-2 remediations were independently confirmed; the fourth introduced
a regression.

1. **Regression I introduced (AC27).** Recognizing akrctx entries by "a command ending in
   `hook <Event>`" claimed a shape any tool may use. The judge planted
   `mytool hook PreToolUse` and `/usr/local/bin/teamhooks hook Stop` in a real
   `.claude/settings.json`; `trace enable` deleted both, silently, and `disable` removed the
   `Stop` key entirely. Destructive, and worse than the bug it replaced — the earlier
   substring matcher left those entries alone.

   Fixed with an explicit ownership marker, `--akrctx-trace`, written into every command
   akrctx wires. It cannot collide with a tool that has no reason to emit that exact flag,
   and it survives the repository being moved, which a path-based match would not. The
   marker is declared as a real option on the `hook` command, and the command additionally
   allows unknown options and excess arguments — an unrecognized flag would otherwise make
   the argument parser exit non-zero, which is the AC26 failure again by another door.
   Legacy bare `akrctx hook <Event>` entries are still adopted so enable stays idempotent
   across an upgrade.

   Reproduced the judge's exact fixture after the fix: all three foreign hooks survive
   enable followed by disable, and no akrctx entry remains.

2. **Mislabelled denominator.** `trace report` said "Sessions that changed project code"
   after AC24 widened the count to include harness edits and writes outside the repository.
   Label and the `totals.mutating` comment now both say "outside `.akrctx/`".

3. **Stale PATH hint.** `trace enable` claimed `akrctx` must be on PATH, which the AC26
   pinning made false for claude, codex and copilot. The hint is now printed only when pi
   is among the wired targets, since its extension does spawn the CLI by name.

Accepted two further points from the judge without being asked to:

- **AC26 was reworded** to state the property rather than mandate absolute pinning. The
  judge was right that the earlier text described one implementation of the requirement.
- **The schema-version decision is now written down** in `context.md`. `TRACE_SCHEMA_VERSION`
  stays at 1, and the reasoning is recorded because `cliVersion` alone cannot disambiguate
  a pre-fix trace from a post-fix one — both stamp `0.4.0`.

## Review round 4

Record: `.akrctx/local/judge/TASK-005-2026-08-03T074500Z.json` — NEEDS_CHANGES, verified
authentic and current by `akrctx judge verify --run-tests`. Every round-3 remediation was
independently confirmed, including the ownership marker against a wider foreign-hook
fixture than the one that exposed the regression, and a direct probe that the argument
parser tolerates unknown flags, reordered flags and excess arguments without a non-zero
exit.

One issue stood, and it was in the capsule rather than the code: AC27's closing sentence
claimed entries from earlier builds are adopted, which is false for the
pinned-without-marker shape the round-2 build emitted. `enable` appends beside it instead
of replacing it.

Fixed by correcting the criterion, not the code. That shape existed only inside this task,
between two review rounds, and was never wired in any installation, so recognition code for
it would be a permanent branch serving a state nothing can be in. AC27 now scopes migration
to the one form akrctx actually released — the bare PATH invocation — and records why the
intermediate shape needs none.

Also took the judge's non-defect suggestion: a pointer beside `TRACE_SCHEMA_VERSION` in
`src/hook/trace.ts` to the decision recorded in `context.md`, so a reader arriving from the
code finds it without going through the capsule.

## Review round 5

Record: `.akrctx/local/judge/TASK-005-2026-08-03T081000Z.json` — NEEDS_CHANGES, verified
authentic and current by `akrctx judge verify --run-tests`.

Every behavioral clause of AC27 was independently confirmed, and the judge checked that
only `trace.ts` moved by measuring the byte and line delta against the size of the inserted
comment rather than trusting mtimes — no compensating change was hiding inside the net.

The issue was a false factual claim in the criterion I had just written. AC27 called the
bare PATH form "The one form akrctx ever released". It was never released: `git log --all --
src/hook` is empty, the committed `src/cli.ts` has no `hook` command, `CHANGELOG.md` mentions
neither hook nor trace, and every tag predates this work. The bare form is an artifact of
round 1 of this task exactly as the pinned-without-marker form is an artifact of round 2.

The judge had been asked to say whether the reason was honest or a rationalization. Its
answer was precise and correct: the load-bearing argument — declining to write a permanent
branch for a state no installation can reach — is real and independently checkable, but the
released-versus-unreleased contrast the sentence was built on did not exist, and it was
false in the direction that flattered the asymmetry.

AC27 now states the true reason. The decision is unchanged: the bare form is recognized
because it costs one pattern and also covers a hand-written entry; the intermediate shape
gets no branch because nothing outside this task emitted it. Both halves are checkable.

## Review round 6 — human review

Six defects found by the developer. Four falsified criteria already marked met, and the
independent judge had passed all of them across four rounds. Worth recording plainly: the
judge's probes ran `runHook` and the CLI with stdin closed, so they never exercised the
process lifetime; and its trace inspections looked for path fragments, so a secret arriving
as a *command argument* was never something it looked for.

1. **AC28 — the binary could outlive its budget.** `readStdin` resolved after 2s but never
   tore down stdin, so an open pipe kept the process alive; and 2s exceeded the 1.5s
   SessionEnd budget the capsule itself cites. Now capped at 750ms with explicit teardown on
   every exit path. Measured against the built binary with a pipe deliberately left open:
   0.84s, exit 0, trace still written.
2. **AC29 — the trace leaked command arguments.** Keeping the first two tokens meant
   `echo SUPER_SECRET_LITERAL` wrote the secret verbatim into the JSONL. Now only the
   executable's basename, and only if it matches a plain-name pattern; anything else
   collapses to "other". The digest already carries exact identity for matching a declared
   validation command, so the readable part can afford to be timid.
3. **AC30 — blocked paths were invisible inside shell commands.** `cat .env` never reached
   `firstPath`, so it was neither flagged nor withheld. The whole command line is screened
   now. Verified: `blocked: true`, and `.env` appears nowhere in the file.
4. **AC31 — the rates counted intentions, not outcomes.** A PreToolUse write counted even if
   rejected or failed, while `sed -i`, `rm` and `git apply` counted for nothing. Attempt and
   outcome are now separate, PostToolUse is wired for every tool rather than only shells, and
   any session where a shell ran — or where attempts got no outcome at all — is marked
   uncertain and excluded from the rates instead of guessed. Four earlier tests had to be
   rewritten: they modelled a host that only delivers PreToolUse, which under the corrected
   semantics is genuinely uncertain rather than compliant.
5. **AC32 — the header had no host**, so conformance data could not be attributed. The
   installer now passes `--akrctx-host <target>`, since it is the only party that knows.
6. **AC33 — enabling could destroy a settings file.** `readJson` turned unparseable input
   into `{}`, and the merge is written back with `force`, so a corrupt `.claude/settings.json`
   was replaced wholesale. Now aborts without writing. Verified: the file is untouched and
   the error names it.
7. **AC34 — Pi still trusted PATH.** Its generated extension spawned a bare `akrctx`. Now
   pinned like every other host.

## Review round 7 — second human review

Five findings, all correct. Three of them falsified fixes made in round 6, which is worth
recording: the corrections to the mutation semantics were right in direction and wrong in
detail, and the detail is where the number lives.

1. **AC35 — outcomes were not correlated to their own call.** `outcomesObserved` was a single
   session-wide boolean, so any later `PostToolUse` settled any pending attempt: an unfinished
   `Edit` stopped looking uncertain the moment an unrelated `Read` succeeded. Now correlated
   by the host's tool-call id, with a same-tool fallback for hosts that send none — without
   that fallback, a host with no ids would have made every session uncertain and killed the
   measurement. Verified: an unrelated success no longer settles a pending write.
2. **AC36 — uncertain sessions could vanish entirely.** A shell command *after* the capsule
   was bound set `mutationUncertain` but not `uncertainBeforeBinding`, so the session appeared
   in neither `mutating` nor `uncertain`. Both doubts are counted now. Fixing the aggregate
   exposed the same defect one layer up: the printed report never showed the held-out count at
   all, so it existed only in `--json`. Now printed.
3. **AC37 — a headerless trace read as complete.** `parseTrace` only flagged invalid JSON or an
   unknown `kind`, so a JSONL of observations with no header, or records missing their
   essential fields, passed as whole and fed the aggregate.
4. **AC38 — empty and unreadable config files were treated as absent**, then overwritten with
   `force`. Only `ENOENT` means absent now; everything else aborts without writing.
5. **Pi hint was stale.** It still called Pi the PATH exception after round 6 pinned it.

Fixing (1) regressed two existing tests, which was the correct signal: their fixtures send no
tool-call id, and under exact correlation their writes never settled. That is what produced
the same-tool fallback rather than a looser rule.

## Review round 8 — third human review

Five findings, all correct. Two of them falsified fixes from round 7, and one falsified a
criterion I had written two rounds earlier.

1. **AC39 — Pi could never contribute a mutation.** Its extension emitted no `toolCallId`
   and never listened to `tool_result`, so every Pi write was an anonymous unresolved
   attempt. Verified against the current Pi documentation: `tool_result` carries the same
   `toolCallId` and an `isError` flag. Both are wired now.
2. **AC39 — Copilot lost every tool failure.** Its reference states a failed call goes to
   `postToolUseFailure` and never to `postToolUse`. Only `postToolUse` was wired, so a failed
   write stayed open and dragged the session into `uncertain` even though the host had
   reported a conclusive result. The failure event is wired for Copilot only, and a
   top-level `error` string is read as a failure.
3. **AC40 — a session with no end read as complete**, so a live or killed session was
   aggregated with its later half missing.
4. **AC41/AC42 — the class behind round 7's fix.** `mutating` was decided inside the path
   branch, so an `apply_patch`, an MCP tool with its own schema, or a `PostToolUse` that does
   not repeat its input fell out of the rates *and* out of the caveat. And a `PostToolUse`
   settled an attempt merely by sharing its call id, without carrying any verdict.
5. **AC36 contradicted its own test.** The criterion claimed two exhaustive buckets while
   read-only sessions belonged to neither, and the test asserted `<=`, which would have held
   even if a session fell out of all of them. There is a third bucket; it is now named,
   counted, and the test partitions all three and checks they sum exactly.

Fixing (4) broke (2) in a way the tests did not catch until an end-to-end run: treating any
unclassifiable mutation as uncertain also caught *settled failures*, so a correctly reported
Copilot failure came back as a doubt. A failure changes nothing wherever it was aimed, so it
settles its call and is not a doubt. That correction came from running the real binary, not
from the suite.

## Review round 9 — implementation of the fourth human review

Four remaining classes were reproduced against `dist/index.js` and fixed together rather
than as independent booleans:

1. Pending attempts now retain their area and binding state until their own outcome arrives.
   A pathless failure therefore resolves to read-only, while a successful post that omits its
   input can reuse the area observed at pre-tool time.
2. Anonymous calls preserve multiplicity. One outcome removes at most one attempt; overlapping
   calls remain conservative when their area or binding order cannot be paired. A fully
   resolved all-failure group becomes read-only instead of remaining uncertain.
3. Trace completeness is terminal: the last nonblank record must be `SessionEnd`. A resume
   header after an older end makes the trace incomplete again until the resumed lifecycle ends.
4. Only `PreToolUse` and post-tool events carry outcomes. An unknown future event naming an
   Edit tool is recorded as `other` without inventing a successful mutation.

The regression suite now drives these cases both through `runHook` and through the built CLI.
Validation after the fixes: 337 tests passed; build, lint and diff checks were clean.

## Notes for review

- **`readBlockedPatterns` is now exported and used with the opposite failure posture.**
  For the judge it fails closed: refusing to compute a boundary is safe there. In the hook
  a throw is the unsafe outcome, so it is caught and the blocked flag degrades to false.
  That is sound only because no path is ever written to a trace — an unreadable policy
  costs a flag, not a leak. If paths are ever added to the trace, this must be revisited.
- **Copilot is wired under VS Code-compatible PascalCase event names**, which its published
  reference says produces the same snake_case payload as the other hosts. That is
  documentation, not an observed run. The normalizer accepts both dialects so the answer
  does not change the code, and `trace status` reports the host as unverified.
- **Tracing was not enabled on this repository.** Wiring `.claude/settings.json` here would
  install hooks that fire on the current session; that is the user's call, not a side
  effect of implementing the feature.
- **Traces grow without bound in long sessions.** One line per tool call, no rotation.
  Acceptable for a two-week measurement, recorded rather than pre-optimized.
- The `hook` command is hidden from `--help`: it is invoked by hosts, not by humans.
