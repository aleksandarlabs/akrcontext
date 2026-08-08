---
type: akrctx-wiki-decisions
title: "Decisions"
description: "Important project and agent-workflow decisions."
tags: ["decisions"]
timestamp: 2026-08-08T00:00:00.000Z
---

# Decisions

Record important project and agent-workflow decisions here.

Include the date, the decision, the context, and the consequences. Link to relevant issues, PRs, or wiki pages when possible.

## 2026-08-05 — Judge reviews bind to local immutable snapshots

**Decision.** The default concurrent-development boundary is an ignored,
content-addressed `SNAPSHOT:<id>`, not an automatically created commit. akrctx never
commits, stages, stashes, checks out, creates refs, or changes live files to obtain a
review boundary. Commit and strict live-`WORKTREE` candidates remain compatible.

**Context.** A judge could review the correct code while developers or agents kept
editing the same worktree. The old verifier then rejected that valid result because the
live digest had moved, encouraging repeated reviews and quiet periods. Requiring an
automatic commit would make the boundary immutable but would take control of Git state
away from the developer.

**Consequences.** Capture uses shallow private Git storage, removes blocked paths from the
reviewable worktree, and copies rather than links local Node dependencies. Strong
verification runs in a disposable workspace so it cannot corrupt immutable source
evidence. Historical approval validity is independent from `CURRENT`, `NEWER_CHANGES`,
or `DIVERGED` applicability to the live workspace. Newer work uses a catch-up snapshot
linked to a strongly verified, recursively intact parent review, so approval is
incremental without silently covering code the judge did not inspect. Retention is
explicit and dry-run-first through `judge prune`. See
`.akrctx/tasks/TASK-007-immutable-judge-snapshots/`.

## 2026-07-22 — Doctor gains an instruction placement rubric

**Decision.** `akrctx-doctor` now carries an explicit rubric for judging instruction
files: load tiers, four per-line verdicts, keep/drop lists, and routing-metadata checks.

**Context.** Doctor was told to "audit agent instructions" but given no criteria for
what belongs in one or where. Its body was almost entirely the protected-merge
protocol — it knew how to edit safely, not what was worth keeping. The rubric is
adapted from the `agent-manifest` skill (same author, separate repo). Its research
section, output format, and platform tables were deliberately left out; the first
rests on a contested reading of arXiv 2602.11988, and akrctx already models targets.

**Consequences.**

- The single edit point for Doctor's body is `doctorBody` in
  `src/templates/instructions.ts`. Installed copies under `.claude/skills/`,
  `.agents/skills/`, `.github/skills/`, and `.pi/skills/` are generated output and
  must never be hand-edited.
- Doctor's semantic findings stay inside `writePolicy.doctor` and persist in
  `.akrctx/wiki/instruction-audit.md`; protected files still go through the merge
  protocol. The deterministic CLI owns and regenerates `agent-setup.md`, `gaps.md`,
  and `recommendations.md`.
- The CLI Doctor verifies mechanical facts. The Doctor skill interprets instruction
  meaning, evidence, duplication, and placement; the shared name does not imply that
  the CLI itself performs LLM reasoning.
- The two copies of the rubric (akrctx and agent-manifest) will drift. Not resolved;
  see the open question in TASK-001.

See `.akrctx/tasks/TASK-001-doctor-instruction-rubric/`.

## 2026-07-22 — Approved protected-file edit to AGENTS.md

**Decision.** The maintainer approved, in conversation on 2026-07-22, the rewrite of
`AGENTS.md` already present in the working tree at that date, and separately approved
dropping the closing note about `pnpm lint` failing that the same rewrite had added.
`AGENTS.md` is a `policy.json` `protectedFiles` entry, so this record is the approval
the merge protocol requires.

**Scope of the approved change,** as it stands against `bd61f99`:

- The `## Architecture` module table is replaced by a pointer to
  `.akrctx/wiki/architecture.md`, which now owns the module map and layering.
- The intro gains a sentence naming `.akrctx/`, `.claude/`, and `AGENTS.md` as a
  dogfooded install of the tool's own output.
- Two constraints added: `src/harness-files.ts` as the single source of required files
  per target, and a prohibition on hand-editing installed harness copies.

The working tree briefly also carried a closing note that `pnpm lint` fails on generated
`.akrctx/**` JSON. It never existed at `bd61f99` and was removed once the biome ignore
made it false, so it does not appear in the diff against base.

**Context.** An `akrctx-judge` run on TASK-001 flagged this edit as an unattributed
protected-file change inside the review boundary — it was real work with no record.
Nothing about the edit was wrong; the audit trail was missing.

**Consequences.** `AGENTS.md` no longer duplicates the module table, so architecture
facts have one home and drift in the other copy is impossible. Future protected-file
edits need their own approval; this one does not generalize.

## 2026-07-22 — `.akrctx/` is excluded from the biome gate

**Decision.** `biome.json` ignores `.akrctx/`, alongside `dist/`.

**Context.** `pnpm lint` failed with 6 formatter errors, all in generated `.akrctx/**`
JSON, because biome collapses their multi-line arrays at `lineWidth: 120`. Formatting
them would desynchronize the files from the sha256 hashes in `.akrctx/manifest.json`,
and the next `init`/`upgrade` would rewrite them from `src/templates/` regardless.

**Consequences.** Generated harness output is no longer linted as project source; the
templates that generate it still are. Downstream projects using biome still inherit the
original problem, because `init` does not adjust their formatter config — tracked in
`.akrctx/wiki/recommendations.md`.

## 2026-08-06 — Pi has no agent format, and that gap is debt rather than a bug

**Decision.** akrctx emits agents for Claude Code, GitHub Copilot, and Codex. Pi is a
supported target for prompts and skills only. Configuring `pi` under any agent's `targets`
produces a warning and is skipped; Doctor states the limitation instead of staying silent
about a target the user explicitly asked for.

**Context.** Pi has no native subagent surface for akrctx to write to — no equivalent of
`.claude/agents/*.md`, `.github/agents/*.agent.md`, or `.codex/agents/*.toml`. Until this
task the exclusion was expressed only as `Exclude<Target, "pi">` in two type aliases, so a
Pi user asking for a judge got silence: no file, no error, no explanation.

**What closing it would need.** A documented Pi agent-definition format with a model field
and an invocation path, plus a way for the akrctx CLI contracts (`judge verify --run-tests`,
the comprehension schemas, the `akrctx impl` attempt store) to be reachable from it. Without
the CLI contracts an emitted Pi agent would be prose akrctx cannot vouch for, which is the
failure the harness exists to remove.

**Consequences.** The limitation is now visible at three surfaces — `enable`, `doctor`, and
the agent warnings in `status` — rather than inferable from a missing file. No akrctx
command fails because of it.

A same-session judge on Pi is verification-only: Pi has no subagent
context, so the agent that implemented cannot be an independent reviewer of its own work.
The review record's `independent` field (added 2026-08-08) makes this honest — a Pi
self-review sets `independent: false`, and the comprehension gate refuses it. The mechanical
half (`akrctx judge verify --run-tests`) still works; the judgment half does not.

## 2026-08-07 — An unknown `agents` entry is preserved and warned about, never rejected

**Decision.** `normalizeConfig` carries an entry under `agents` that akrctx does not
recognize through untouched, resolves only the three it has a CLI contract for, and reports
the rest as a warning. It no longer throws, and Doctor no longer raises the same entry as a
config gap.

**Context.** The entry list is fixed on purpose: each agent is trustworthy only through the
command behind it. Enforcing that at read time was one step too far. `normalizeConfig` runs
inside every `readConfig`, so a config written by a newer akrctx that knew a fourth agent
disabled *every* command of an older CLI, not the one command that would have used it.
Dropping the entry instead was rejected as worse: the older CLI's next `config set` would
then delete the newer one's settings, trading a loud failure for a silent loss.

**Consequences.** Reading a config and writing it back is byte-identical for entries akrctx
does not own. The fixed entry list still governs what akrctx *generates* — nothing is
emitted for an unknown entry. The one remaining read-time error in the block is
`agents.implementer.maxAttempts`, whose domain akrctx fully knows and where a fallback would
grant the unlimited budget the setting exists to prevent.

## 2026-08-07 — The implementation log verifies its own privacy on every command

**Decision.** `impl enable` refuses, and `impl start`, `impl log`, and `impl status` report
the task as stopped with no attempt count, when `.akrctx/local/.gitignore` is missing or no
longer ignores local storage.

**Context.** The log's placement under `.akrctx/local/impl/` was documented as putting it
outside every review boundary "by construction". The construction was a file the store does
not own. Nothing checked it, so in a repository where that ignore had been deleted or
weakened the log became a tracked file and entered the diff the judge reads — the
implementing agent's own account of its work as review evidence, which the judge contract
forbids. `comprehension enable` already had this guard for the same directory.

**Consequences.** The refusal is reported through the existing `blocked`/`reason` channel
rather than by throwing, so an agent-facing command answers with a reason instead of a stack
trace. A freshly initialised repository satisfies the check with no extra step, and
`akrctx doctor --fix` restores the ignore.

## 2026-08-07 — Snapshot dependency copying classifies symlinks instead of flattening them

**Decision.** `copyLocalDependencies` walks `node_modules` and decides per symlink. One
whose target resolves inside the dependency tree is recreated, relative, against the
snapshot's own copy. One that resolves outside is dereferenced into content. The blanket
`dereference: true` is gone.

**Context.** Dereferencing everything was a correct answer to the wrong question. It did
guarantee that a snapshot never holds a link back into the live project — the property the
whole isolation model rests on — but it bought that with a directory in which pnpm's layout
no longer works. pnpm gives each package its own resolution root through a symlink farm over
`node_modules/.pnpm`; flatten the farm and transitive dependencies stop resolving. Vitest
aborted at config load with `ERR_MODULE_NOT_FOUND` before reading a single test file, which
meant `akrctx judge verify --run-tests` — the one check that re-executes validation instead
of trusting the judge's claim — could not run on any pnpm project.

Found by the independent review of TASK-010, which reported `BLOCKED` having found no defect
in the code it was asked to review. The failure had been latent since snapshots shipped.

**Consequences.** Isolation is now stated as the property it always was — no surviving link
resolves outside the snapshot — and tested directly, rather than being implied by a copy
mode. An escaping link is still dereferenced rather than dropped, so a workspace dependency
keeps working and validation does not fail for a reason unrelated to the code under review.
A flat `node_modules` has no internal links and is unaffected.

**A note on the declared validation command.** TASK-010 declared `npx tsc --noEmit` in its
capsule while the repository had pre-existing type errors in test files. A failed entry
invalidates a review record under any verdict, so that capsule could never have been
approved regardless of its code. A declared validation command has to be one that can
actually pass.

## 2026-08-07 — `enable` regenerates its agent file, and writes report what they did

**Decision.** The three `enable` commands write their agent file unconditionally rather than
passing the user's `--force` through. `writePlannedFile` reports a rewrite that changes
nothing as `preserve` with "Already current." rather than as an update. The CLI prints a
marker per write kind: `+` created, `~` updated, `=` preserved, `!` suggested.

**Context.** Found in manual QA, not by the suite. The normal sequence — enable an agent,
notice no model, set one, enable again — silently did nothing, because an existing agent
file was preserved. `akrctx upgrade` and `enable --force` both worked, so the feature was
correct everywhere except the path a person actually takes.

The suite missed it for an instructive reason. It tested that `upgrade` regenerates a
configured model, because that was the bug the model feature was built to fix: a hand edit
that the next upgrade overwrote. Nobody tested the second `enable`, so the command that
introduces the setting was the one command never exercised twice.

The reporting defect is the more serious of the two and made the first one hard to see. The
CLI printed `+ <path>` for every entry in `writes` without reading its `kind`, so a file it
had decided not to touch looked exactly like one it had created. A tool that reports a write
it did not perform cannot be trusted about the writes it did.

**Consequences.** Agent files are now owned by akrctx consistently across `enable` and
`upgrade`, which is what the generated file already told its reader ("a model added here by
hand does not survive"). Nothing moved across the protected-file line: protected instruction
files are still preserved and still produce a suggestion. Idempotence is now visible rather
than assumed — a repeat `enable` prints `=` on every line.

## 2026-08-07 — A repeat `init` adds a target rather than replacing or ignoring one

**Decision.** `akrctx init --target <new>` in an existing installation merges the target into
`config.targets`, keeps `defaults.target` and every other setting, and writes the config back.
`init` never shortens the list; `akrctx remove --target` owns that direction.

**Context.** The command assigned `config.targets = selectedTargets` and wrote the config
through a preserving write, so on a repeat run neither the assignment nor anything else
reached disk. The result was two subsystems disagreeing about the same question: `doctor`
detects targets from the filesystem and answered "Installed: claude, copilot", while the
agent commands read `config.targets` and answered "claude is not installed" — for a target
the user had just installed, on a repository `doctor` scored 100/100.

Replacing instead of adding was considered and rejected. `init` does not delete the previous
target's files, so replacing would leave disk and config disagreeing in the other direction,
and a multi-agent repository is an ordinary case rather than a mistake to correct.

**Consequences.** `defaults.target` is now set only on a first install: it answers which
target a command assumes when none is given, and a second install adds a target without
restating that preference. The config write is forced only when the existing config could be
read and merged into — an unreadable one is left untouched for `doctor` to report, because
overwriting it with defaults would destroy a file the user can still recover. `doctor --fix`
now counts an updated file as fixed, not only a created one, since init can repair a config
on its way through.

**Found by manual QA, not by the suite.** The bug predates the agents work entirely; the
agents are simply the first subsystem to consume `config.targets` and say out loud when it
disagrees with what the user asked for. A contradiction that had been silent for as long as
`init` had been re-runnable became a visible warning, and the warning is what got it fixed.

## 2026-08-08 — Legacy agent keys are mirrored, not migrated, and the mirroring has a sunset

**Decision.** The legacy `judge`, `comprehensionGate`, and `impl` keys are kept in step
with the canonical `agents` block on every write, mapped onto `agents` in memory on every
read, and never migrated or deleted on disk. `akrctx doctor` reports divergence when the
two forms are hand-edited apart, with `agents` winning. This mirroring is **debt with an
exit**, not a permanent design: it exists to keep an older akrctx reading the same file
behaving the same way while the `agents` block adopts.

**Context.** The `agents` block is the canonical configuration, but the older keys predate
it and are present in every config that ran an older CLI. Silently dropping them on a write
would delete settings an older CLI still reads; silently ignoring them on a read would let
two sources of truth quietly disagree. Mirroring plus divergence reporting was the
conservative choice that avoids both silent failures.

**Sunset criteria.** The mirroring is removed when **all** of the following hold: (1) the
minimum supported akrctx version reads the `agents` block natively and no longer reads the
legacy keys; (2) a released `akrctx upgrade` rewrites existing configs to drop the legacy
keys with a one-time, in-conversation human approval (a protected-file-style change, since
it edits user config); (3) `doctor`'s divergence check is retired in the same release. Until
then the dual-reading complexity in `config.ts` and `agents.ts` and the divergence logic in
`doctor.ts` are intentional and owned, not accidental. Revisit at each minor release that
raises the minimum supported version. See `.akrctx/tasks/TASK-017-agent-config-design-debt/`.

## 2026-08-08 — Per-target model patterns are a maintenance surface with known false-positives

**Decision.** Model identifiers in `agents.<name>.model.<target>` are validated by a
per-target regex shape (`modelPatterns` in `src/agents.ts`), and a mismatch is a warning,
never an error. The patterns are explicitly a **maintenance surface**: they are revisited
as providers release new model identifiers, and they have known false-positives that warn
by design.

**Context.** A catalogue of model names goes stale on every provider release and would make
a new model unusable until akrctx shipped a version that knew about it. A shape pattern does
not expire. But akrctx does not have any provider's catalogue, so the patterns themselves
are hand-curated and will drift: the `claude` pattern already covers aliases, full names,
Bedrock ARNs, Mantle ids, and Vertex names; the `codex` and `copilot` patterns are simpler
and will fall behind sooner. Foundry deployment names are arbitrary and will warn — the
correct signal for an identifier akrctx cannot recognize, since refusing it would block a
legitimate deployment to catch a typo.

**Maintenance expectation.** Each pattern's doc-comment names the shape it expects and the
forms it deliberately does not cover. When a provider ships an identifier class the pattern
misses, the fix is to widen the pattern (a warning is the symptom, not the bug). The
warning-not-error contract is load-bearing: a mismatch must never block a write, because
akrctx cannot distinguish a new model from a typo. Revisit the patterns per provider
release; treat a false-positive report as the trigger. See
`.akrctx/tasks/TASK-017-agent-config-design-debt/`.

## 2026-08-08 — The `agents` block is closed to three entries, with a reconsideration trigger

**Decision.** `agents` holds exactly three entries — `judge`, `comprehension`, `implementer`
— and a project cannot declare an agent of its own. An unknown entry is preserved verbatim
and warned (see the 2026-08-07 record), never resolved or generated. The closed surface is a
**known limit**, not an oversight, and it has a trigger to revisit.

**Context.** Each of the three agents is trustworthy only through the CLI contract behind
it — `judge verify --run-tests`, the comprehension schemas, the `akrctx impl` attempt store.
An entry with no command behind it would be an agent akrctx generates and cannot vouch for,
which is the failure the harness exists to remove. Templates and packs can carry prose, but
prose without a contract is exactly what the fixed list refuses. This is distinct from the
unknown-entry record, which is about *tolerating* a newer akrctx's fourth entry; this record
is about *never emitting* one ourselves without a contract.

**Reconsideration trigger.** The surface is reopened when a fourth workflow gate has **both**
a defined agent-definition format for at least one supported host **and** a CLI contract
akrctx can execute and vouch for (the analogue of `judge verify --run-tests` or the impl
attempt store). Repeated user requests for a fourth contract-backed gate (design review,
docs review, security review) are the signal to scope that work; a prose-only fourth agent
is never sufficient. Until then, a project that needs a bespoke gate writes it as a
hand-maintained agent file outside the `agents` block, which akrctx neither generates nor
overwrites. See `.akrctx/tasks/TASK-017-agent-config-design-debt/`.


## 2026-08-08 — Judge snapshot stability is content-based, not mode-based

**Decision.** `workspaceManifest`/`addManifestPath` hash file content and entry type
(file/symlink/dir), not the unix permission bits. The capture-time stability check and the
load-time integrity check both feed this manifest.

**Context.** The manifest previously hashed `file:<mode & 0o777>`. A fresh `git checkout` in a
`umask 0002` environment yields mode 664, while tracked files sat at 644 and akrctx-written
untracked files at 664, so no single umask satisfied the mode-sensitive comparison and
`akrctx judge snapshot` failed its stability check in every mixed-umask environment. The failure
message even said "retry after file writes settle", pointing at a transient race that was not
happening. Mode is not a tamper signal for this check: the scope digests bind the boundary, and
git tracks mode in the tree. The stability check exists to detect content drift during capture,
not permission drift.

**Consequences.** Existing local snapshots' `workspaceDigest` and snapshot IDs change, because
the digest scheme changed; local snapshots are ephemeral and ignored, so they are recaptured.
The capture error message now distinguishes the deterministic snapshot-vs-live mismatch (names
the differing paths, says it is not a transient race) from the two-pass `sameLiveBoundary`
transient retry. See `.akrctx/tasks/TASK-018-judge-snapshot-mode-and-pi-independence/`.

## 2026-08-08 — Judge review records carry an `independent` flag, and self-review is verification-only

**Decision.** The review record has an optional `independent` boolean (absent means `true`). A
reviewer who is the same agent or session that implemented the task, or who runs on a host with
no subagent isolation, sets `independent: false`. `akrctx judge verify` reports a non-independent
record as a notice that never changes `valid`, `approved`, or the exit code. The comprehension
gate requires `independent: true` (alongside `approved: true` and `judge current` `CURRENT`) and
refuses a non-independent approval.

**Context.** Pi has no agent format (decision 2026-08-06), so the judge cannot run as an
independent subagent there. While self-reviewing TASK-017, the same Pi session that implemented
read the judge skill and produced a review — a structurally non-independent judgment presented
as if it were independent. The mechanical half of the judge (re-execute the capsule-declared
commands, bind the verdict to the boundary digest) survives without independence, and that is
what `verify --run-tests` checks. The judgment half (what is worth reporting, scope discipline)
does not survive, and that is exactly the part independence protects. Silently accepting a
self-review as a full independent approval would defeat the harness.

**Consequences.** This is convention + schema + comprehension refusal, not cryptographic
independence. It makes honest self-reviewers flag themselves and prevents a flagged record from
quietly satisfying the comprehension gate; it cannot stop a determined adversary from lying,
which is consistent with the project's stance that policy is prompt-level. On Pi, a same-session
judge is non-independent by construction and must set the flag; for an independent verdict the
judge is run from another host (Claude Code, Codex, Copilot subagent) or a separate session.
Because `judge current` requires a snapshot, a Pi self-review that falls back to `WORKTREE`
cannot reach `CURRENT` and so cannot satisfy the comprehension gate even if marked independent.
See `.akrctx/tasks/TASK-018-judge-snapshot-mode-and-pi-independence/`.

---

## 2026-08-08 — `verify --run-tests` requires operator approval; no allowlist/denylist

**Decision.** `akrctx judge verify --run-tests` no longer executes capsule-declared commands
without operator approval. In a TTY it prints the exact command list and prompts y/N; headless
mode requires a repeatable `--approve-commands <cmd>` flag — one occurrence per command — matching
the declared list byte-for-byte in order, else it refuses and exits non-zero. The decision is
injected into `verifyJudgeRecord` as an `approve` callback; TTY detection and flag parsing stay in
`src/cli/judge.ts`, keeping terminal I/O out of the enforcement module. `--run-tests` additionally
requires a `SNAPSHOT:<id>` candidate and refuses `WORKTREE` or bare commit refs, which removes the
last path that executed in the live tree. No content allowlist or denylist is added, even as
defense in depth.

**Why.** The 2026-08-08 security audit (item 5) found that `runValidationCommand` runs shell
strings sourced from the artifact under review with no operator control, and the `declaredAndPassing`
double gate only requires the command to appear in two files the same branch author controls. An
allowlist of `npm`/`pnpm`/`npx`/`node` does not close the hole (`pnpm run`, `node -e`, `npx <pkg>`
all RCE through `execFile`), and a denylist of anticipated spellings (`rm -rf /`, `curl|sh`)
filters only the exact form an attacker re-spells while breeding false confidence that degrades
the one gate that works — operator attention. Operator approval is the sole honest barrier
without a SO-level sandbox, which is out of scope for a Node CLI consistent with the project's
prompt-level policy stance.

The flag is repeatable rather than comma-separated because declared commands legitimately contain
commas (`vitest run --reporter=default,json`), and a CSV encoding with no defined escape would
make those commands unapprovable. Order sensitivity has no security value on its own, but it
forces the operator to paste the printed list instead of hand-assembling one, and that
confirmation is the control. Snapshot candidates are required rather than giving non-snapshot
records a worktree of their own: `git worktree add` cannot materialize a dirty `WORKTREE`
candidate, and for a commit ref it would arrive without the dependency layout the snapshot
machinery exists to carry, so the alternative was duplicating snapshot capture.

**Consequences.** Two breaking changes to `--run-tests`: CI must pass `--approve-commands`, and
records with a non-snapshot candidate are refused (capture a snapshot first). Verification without
`--run-tests` is unchanged on those records. The review schema is unchanged. See
`.akrctx/tasks/TASK-019-run-tests-operator-approval/`.

## 2026-08-08 — Judge instructions embed a complete example record, not a field-name list

**Decision.** `judgeInstructions` in `src/templates/judge.ts` ends with a complete, minimal
example record in a `json` fenced block, exported as `judgeExampleRecord`, rather than a prose
enumeration of the top-level field names. `schemaVersion` (top-level and inside `scope`) is
interpolated from `JUDGE_SCHEMA_VERSION` — the same constant `review.schema.json` is generated
from — so the example cannot go stale at a version bump. The instructions state no other keys
are accepted, each `tests` entry carries exactly `command`, `status`, `evidence`, and
`independent: false` is conditional (absence means `true`). `validateRecord` is exported from
`src/judge-enforcement.ts` so a test validates the embedded example against the real validator,
not a reimplementation.

**Why.** The TASK-020 judge produced `schemaVersion: 1` and used `notes` where the schema
requires `evidence`, so `akrctx judge verify` rejected the record; the trusted caller
hand-edited it to pass. The judge is read-only by contract, so an invalid record lands on the
caller as a temptation to edit the reviewer's output — exactly the tampering surface the judge
README warns about. Naming the top-level keys invited the agent to build the shape by reading
sentences; an example is copied, not inferred. Tolerating `notes`/absent `schemaVersion` in
`validateRecord` was rejected: it would move the contract out of the schema and force every
consumer to handle more than one shape to spare one sentence in a prompt. Making the example a
hand-written literal `2` was rejected: it would silently go stale at the next `JUDGE_SCHEMA_VERSION`
bump, reintroducing this exact bug.

**Consequences.** The record shape is now defined in three places (`validateRecord`,
`review.schema.json`, the example) with no mechanical link between the first two; the test links
the third to the first. Generating the example from the schema instead of writing it by hand is
left as an open question. The comprehension agent has the same defect in a worse form (it names
no field across three schemas) and is deliberately untouched while `comprehensionGate.enabled`
is `false`. See `.akrctx/tasks/TASK-021-judge-record-shape/`.

## 2026-08-08 — Snapshot `verify` materialises dependencies from the lockfile; integrity detects write-then-restore

**Decision.** `createJudgeSnapshotValidationWorkspace` no longer copies the snapshot's
`node_modules` into the disposable validation workspace; it materialises dependencies from the
committed lockfile with a frozen install (`pnpm install --frozen-lockfile`, `npm ci`, or
`yarn install --frozen-lockfile`). A boundary with no `package.json` (or no dependency fields)
needs no install and is unchanged; one that declares dependencies but has no lockfile, or whose
install fails, fails verification with a named reason and never falls back to the snapshot's copy.
Separately, the snapshot integrity fingerprint is split into `content` and `stat`
(`inode` + `ctimeMs`): files and symlinks carry content plus stat, and every covered ancestor
directory (excluding the worktree root) carries a `dir` stat entry. `contentDigest` is the
content-addressed snapshot id; `workspaceDigest` (content + stat) is the integrity digest. A load
checks content first ("workspace content no longer matches its capture") then stat ("workspace
was modified after capture"). `SNAPSHOT_VERSION` is now 2; a version-1 snapshot fails to load
saying it predates write detection.

**Why.** Two holes found while reviewing TASK-021. (1) `node_modules` is gitignored, so it carries
no integrity digest, yet `verify --run-tests` — whose purpose is to stop trusting the judge's
claim — re-executed against the snapshot's private `node_modules` copy, which the judge could have
altered. (2) The integrity digest was checked on load, not continuously; the TASK-021 judge
copied a scratch file into the snapshot's `evals/` and removed it, and nothing reported it
because the content matched again by the time anything looked. Hashing `node_modules` was
rejected (thousands of files, and the dependence on those bytes is what the fix removes);
materialising from the lockfile rests re-execution on a tracked, digest-covered file instead. A
content-only fingerprint cannot see a write-then-restore or create-then-delete; `ctime` is
kernel-set on Linux and not backdatable without root, and the worktree root is excluded so
honest ignored build output does not false-positive. The research measurement (0 of 301 covered
files and 0 of 92 tracked dirs drifted after an honest `pnpm lint && pnpm build && npx vitest
run`, on Linux arm64) is the evidence the modification fingerprint does not cry wolf.

**Consequences.** `verify --run-tests` is slower and gains a network/store dependency where there
was none; the failure path is legible when it bites in CI. Every existing local snapshot id
changes (the fingerprint changed), so old snapshots fail to load with the predates-write-detection
message rather than being silently accepted. The worktree root stays outside the fingerprint, so
a create-then-delete at the root is not detected (root receives legitimate ignored output). The
comprehension agent and judge instructions are untouched. The record shape's three definitions
(`validateRecord`, `review.schema.json`, the example from TASK-021) are unchanged here. See
`.akrctx/tasks/TASK-022-snapshot-write-detection/`.

### Correction (same day, after an independent judge round blocked TASK-022)

The fingerprint as first shipped included the **inode number** alongside `ctimeMs`. That was
wrong: the inode number is synthesized by FUSE daemons (and some network mounts) and drifts over
time even when nothing changed, so a captured `workspaceDigest` became irreproducible at load and
an honest snapshot turned permanently unreviewable — a false "workspace was modified after
capture" with no modification. An independent review round reproduced this on snapshots that had
never been written to after capture. The inode number is now **removed**; the fingerprint is
`ctimeMs` only (kernel-set, stable, changes only on a modification, still detects
write-then-restore / create-then-delete / rm-then-recreate). `SNAPSHOT_VERSION` moved to 3.
Capture was also made atomic on the failure path: a self-verifying load that fails after the
rename now removes the renamed snapshot directory instead of leaving a permanently unloadable
one. The earlier research measurement missed this because it compared two reads taken seconds
apart, and inode drift on this mount manifests over minutes-to-hours, not seconds. See
`.akrctx/tasks/TASK-022-snapshot-write-detection/log.md`.
