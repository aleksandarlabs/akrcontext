# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `akrctx impl enable`, `akrctx judge enable`, and `akrctx comprehension enable` warn when
  they create `.claude/agents/` for the first time, and the README documents the constraint.
  Claude Code watches `.claude/agents/` for live changes, but it does not watch a directory
  that did not exist when the session started, so the very first agent akrctx writes in a
  repository is not spawnable until the session restarts — it reports the agent type as not
  found. The notice fires only on the run that creates the directory. Every later run leaves
  it out, because the watcher already covers the file and an always-on warning would train
  the reader to ignore it. A `--dry-run` leaves it out too: it writes no file, so nothing is
  undiscovered and no restart would help. The generated frontmatter was never at fault.

- `.akrctx/upgrades/.gitignore`, written by `akrctx init` and restored by `akrctx upgrade`
  and `akrctx doctor --fix`. It ignores everything in the directory and keeps only itself
  trackable, the same rule `.akrctx/local/.gitignore` already used. Upgrade candidates are
  suggestions nobody accepted yet, so a candidate for `AGENTS.md` or `CLAUDE.md` that reaches
  a commit puts a rejected copy of an instruction file in the tree, where an agent reading
  the repository can find it. The project's own root `.gitignore` is never touched.

### Changed

- Judge snapshots now resolve `--base` once to a full commit SHA and use that canonical identity
  for scope, digests, snapshot capture, currency checks, and independent verification. The
  requested branch, tag, or remote ref is optional diagnostic metadata only; legacy snapshots
  without canonical base metadata fail with an explicit recapture diagnostic.

- `akrctx upgrade` now centralizes candidate creation, public suggestion classification, and
  SHA-256 provenance registration in one internal writer. Managed files, root instructions,
  and invalid policy repairs use the manifest ledger; invalid manifest repairs use the external
  runtime-local ledger, so neither path can adopt a pre-existing candidate while dry-run
  preserves the same output without recording provenance.

- Judge validation now preserves bounded, redacted evidence for the current failed execution in
  JSON and human output: normalized command, observed exit code or signal, and diagnostic extract.
  Secret-bearing names include prefixed and compound environment variables; optional causal
  diagnoses are separate from observations and limited to `inferred` or `confirmed`, with no
  cross-invocation history retained.

- Documented the validation-receipt design boundary: local records and hash-linked
  files provide persistence/integrity but not authenticity, so re-execution remains
  non-transferable by default. A future transferable claim must come from an optional
  externally trusted CI/orchestrator receipt bound to the exact snapshot, record,
  commands, results, CLI, policy, and lockfile; it must not reuse execution consent or
  turn `valid`, `approved`, or `CURRENT` into proof of re-execution.

- `akrctx upgrade` removes a resolved candidate only when durable provenance proves that
  akrctx created it, its current bytes still match the recorded SHA-256 hash, and those exact
  bytes have been applied to the destination. Pre-existing, foreign, legacy, or tampered
  candidates are never adopted or deleted. The same rule covers managed files, root
  instructions, and repair candidates for invalid manifest or policy files; invalid manifest
  candidates additionally require external ledger provenance. Partial-target
  runs and candidate directories from earlier versions remain non-destructive; `--dry-run`
  reports the same classification without changing files or provenance. Confirmed removals
  appear in the CLI output and as `removed` in `UpgradeResult`.

- The generated lead-agent instructions now honour the resolved implementer trigger instead
  of treating every enabled implementer as `post-clarification`. `on-request` waits for the
  user to request the handoff; `post-clarification` offers it only after the capsule is ready
  and ambiguities are resolved. Every handoff still requires explicit human confirmation.
  `akrctx impl status` exposes the canonical-or-legacy resolved `enabled` and `trigger`
  values, and disabled implementers refuse both `impl start` and `impl log`.

- Generated task checklists now finish with a pre-snapshot `ready for independent review`
  condition. Lead-agent instructions prohibit adding a post-APPROVED completion checkbox:
  the verified APPROVED record and `judge current` reporting `CURRENT` are the evidence that
  review completed. Real later capsule edits remain part of `taskDigest` and still require a
  catch-up review.

- Implementer logs now require an explicit, ordered red→green validation pair for `TDD`,
  `SDD+TDD`, and `TDD+EDD` workflows. The red run records `phase: "red"`, a failing status,
  verbatim output, and an `expectedFailure` found in that output; the green run records
  `phase: "green"` and the same whitespace-normalized command passing. Invalid or incomplete
  evidence is refused before the round is persisted and produces an actionable non-zero CLI
  result. Non-TDD workflows and existing records remain compatible without invented evidence.

### Fixed

- `akrctx upgrade` once again supports the complete declared Node `>=20` range. Candidate
  cleanup now walks directories explicitly with the Node 20.0 `Dirent` surface instead of
  relying on `Dirent.parentPath` or recursive `readdir`, which are unavailable in early Node
  20 releases. The traversal remains deterministic, skips nested symlinks, and refuses a
  symlink used as the candidate root.

- Judge snapshots of akrctx now build their CLI artifact with a fixed internal `esbuild` API
  call (`src/index.ts` → `dist/index.js`) instead of executing any command from the captured
  `package.json`. This keeps validation suites that invoke `dist/index.js` working without
  treating a mutable `scripts.build` as trusted code. Consumer projects remain source-only;
  capture rejects symlinked entries and any local import or loaded path whose `realpath` escapes
  the private snapshot, while package imports remain external. Capture stays isolated, restores
  copied package-manager state, binds generated `dist/index.js` and its sourcemap to snapshot
  integrity, rejects an out-of-bound `package.json` before reading it, and fails explicitly when
  the fixed entry is missing. Judge validation now runs in a disposable copy so build commands
  cannot invalidate the canonical snapshot. A failed fixed build leaves no partial snapshot behind.

- `akrctx judge verify` no longer counts a "no questions" bullet as an unresolved open
  question. The reader dropped one exact string, `None recorded yet.`, the phrase the
  template ships. A person who closed the section by hand wrote `None remaining.` instead,
  and the reader took it for a real question. The rule now covers the "none" word itself
  (`none`, `ninguna`, `ninguno`, `n/a`) with an optional closing word from a fixed list:
  `remaining`, `left`, `yet`, `recorded yet`, `so far`, `open`, `pending`. It stays narrower
  than a free sentence on purpose, so a bullet that opens with "None" and then says
  something (`None of the callers validate X`) still counts. `## Clarifications` and
  `## Open Questions` share the reader, so both sections follow the same rule. The shipped
  template is unchanged.

- The installed review schema now accepts the optional `independent` boolean the judge
  instructions have told the agent to emit since 0.5.0. The field reached the runtime, the
  agent instructions, and the changelog, but never the schema template, so every published
  install shipped a schema whose `additionalProperties: false` rejected a field its own
  instructions required. A non-independent judge produced a record `akrctx judge verify`
  refused as INVALID, with no way to fix it short of hand-editing the schema. The change only
  widens the schema: every record valid before stays valid, and no migration is needed.
- The judge instructions now enumerate the accepted top-level keys and state that a record
  carrying any other one is invalid. `evidence` is named as the concrete case: it belongs to a
  `tests` entry and never to the top level. Judges were inventing a top-level `evidence`
  summary, which the schema rejected. Prose findings belong in the report, not the record.

### Security

- `akrctx judge scope` and `akrctx judge snapshot` now fail closed when their changed boundary
  contains another task capsule under `.akrctx/tasks/TASK-YYY-*`. Intentional joint reviews
  require a repeatable `--include-task TASK-YYY` opt-in; every accepted ID remains visible in
  `includedTaskIds`, is bound to `scopeDigest`, and is inherited unchanged by catch-up snapshots.
  Snapshot candidates validate that a supplied inclusion list matches the list captured in the
  immutable scope, while all other changed worktree files remain inside the digest. This changes
  the judge review contract to schema v3, so records written against v2 must be regenerated.

## [0.5.0] - 2026-08-08

### Added

- A project-level `.akrctx/review-policy.md` file that holds review criteria applying to
  every task. The judge and implementer agent instructions now read it when it exists and
  apply its entries in addition to each capsule's `acceptance-criteria.md`. Its absence is
  normal and silent; `akrctx init` does not create it and no CLI command, flag, config key,
  manifest entry, or doctor check is added. The file may only add criteria and can never
  relax the verdict rules, APPROVED requirements, independence rules, validation-evidence
  rules, or safety section; a genuine conflict with a capsule criterion resolves in favour
  of the capsule for that task.
- An `agents` block in `.akrctx/config.json` as the canonical configuration for all three
  akrctx agents — `judge`, `comprehension`, `implementer`. Each accepts `enabled`,
  `trigger`, `targets`, and a per-target `model`; `implementer` also accepts `maxAttempts`.
  The block holds those three entries and no others: each is trustworthy only through the
  CLI contract behind it, and an entry with no command behind it would be an agent akrctx
  generates and cannot vouch for.
- Per-target agent models. `agents.<name>.model.{claude,codex,copilot}` is written where the
  host reads it — `model` frontmatter for Claude Code and Copilot, the `model` key for the
  Codex TOML — and regenerated by `akrctx upgrade`, so the setting survives regeneration.
  This replaces the instruction to hand-edit a generated file, which the next upgrade
  overwrote. `akrctx config set agents.judge.model.claude opus` and the equivalents for the
  other agents and hosts set it.
- Shape-based validation for model identifiers and triggers, reported as a warning and
  never as an error. akrctx has neither a provider's model catalogue nor an enumeration of
  every point in a workflow an agent might be invoked at, so an unfamiliar value is written
  exactly as configured and reported by `enable`, `doctor`, `upgrade`, and `status`.
- `akrctx impl` — `enable`, `disable`, `start`, `log`, `status` — and the implementer agent
  for Claude Code, Copilot, and Codex. The append-only implementation log lives at
  `.akrctx/local/impl/<TASK-ID>/log.md`, outside every review boundary, so recording a round
  never moves `taskDigest`. The attempt count is derived from the persisted records rather
  than supplied by the caller, `impl log` enforces the budget itself so skipping `impl start`
  does not escape it, and an unparseable log is reported as unreadable rather than as zero
  attempts used.
- `akrctx status` reports each agent's enabled state and trigger, plus any agent
  configuration warning.

### Changed

- **Breaking.** `akrctx judge verify --run-tests` no longer executes anything without operator
  approval. The commands it re-runs are shell strings taken from the capsule under review, so a
  human decides: in a terminal the exact list is printed and confirmed with y/N; headless, the
  list must be reproduced with a repeatable `--approve-commands <cmd>` flag — one occurrence per
  command, in declared order. Absent or mismatched approval refuses to run anything and exits
  non-zero. Existing CI that passes `--run-tests` must add `--approve-commands`. The flag is
  repeated rather than comma-separated because declared commands legitimately contain commas.
  `judge snapshot --from-review` takes the same flag: catch-up strongly verifies its parent,
  which re-executes those commands too.
- **Breaking.** `akrctx judge verify --run-tests` requires a snapshot candidate. A record whose
  candidate is `WORKTREE` or a bare commit ref is refused; capture a snapshot and verify that
  record instead. Re-execution previously ran in the live working tree for those records, which
  let a validation command modify the project being reviewed. Verification *without*
  `--run-tests` is unchanged for them.
- `judge enable`, `judge disable`, `comprehension enable`, and `comprehension disable` write
  `agents.<name>` and keep an existing legacy key in step. Legacy `judge`,
  `comprehensionGate`, and `impl` keys keep working, are never migrated or deleted on disk,
  and are mapped onto `agents` in memory. When the two forms are hand-edited apart, `agents`
  wins and `akrctx doctor` reports the divergence naming both paths and the effective value.
- Agent triggers are free strings. `comprehensionGate.trigger` is no longer clamped to
  `agent-assessed-significance`, and an unrecognized value is propagated with a warning
  instead of being reported by Doctor as a config gap.
- Doctor's agent gap checks read the resolved configuration instead of parsing the raw
  legacy keys, so a project configured only through `agents` is diagnosed against the keys
  it actually uses. The threshold also tightened: a gap is reported when any expected agent
  file is missing, where the judge check it replaced fired only when every one of them was,
  which left a partially installed multi-target project reporting as complete.
- `judge enable`, `comprehension enable`, and `impl enable` regenerate an agent file that
  already exists instead of preserving it, so a model set after the first enable reaches the
  file. Previously only `akrctx upgrade` or `enable --force` applied it, which made the
  per-target model setting appear not to work on the path most users take. A regeneration
  that produces identical content reports as unchanged and rewrites nothing.
- The CLI prints each write according to what it did — `+` created, `~` updated, `=`
  preserved, `!` suggested — instead of rendering every entry as a creation. A preserved
  file was previously indistinguishable from a written one, so the CLI reported writes it
  had decided not to perform.
- `akrctx init` names `akrctx impl enable` alongside the other two agent commands in its
  next steps, so the implementer is discoverable from the screen every new user reads.
- `akrctx init --target <new>` in an existing installation adds the target to
  `config.targets` instead of writing its files and recording nothing. The target list was
  assigned rather than merged, and the config was preserved on a repeat run, so `doctor`
  reported a target as installed from disk detection while every agent command reported the
  same target as absent from configuration. `defaults.target` and every other existing
  setting are preserved; `init` never shortens the target list.
- `akrctx init --target <new>` in an existing installation now warns when an enabled agent
  with an explicit `agents.<name>.targets` list does not cover a newly added target, so
  "I added a target and my agent didn't show up there" is visible at install time. Only
  genuinely newly added targets warn — re-running `init --target <already-installed>`
  (which `doctor --fix` does per detected target) never claims an existing target is new.
  The warning is non-blocking — the explicit list is the user's narrowing and is never
  overruled; first installs and agents without an explicit list warn nothing. `--target all`
  warns per newly added, uncovered target consistently with `--target <one>`. Surfaces as
  `agentTargetWarnings` in `InitResult` and an "Agent target narrowing" section in `init`
  output.
- Generated agent files are recorded in the provenance manifest, so `akrctx upgrade` can
  regenerate them from configuration rather than preserving them with a merge suggestion.
- `akrctx remove` now deletes the judge and implementer agent files alongside the
  comprehension one. Previously only the comprehension agent was removed, so `remove
  --target claude` left `.claude/agents/akrctx-judge.md` behind.
- An unknown entry under `agents` is a warning rather than an error, and is preserved in
  the file untouched. Rejecting it made a configuration written by a newer akrctx disable
  every command of an older one, and dropping it would have made the older one's next write
  delete the newer one's settings.
- Every `akrctx impl` command verifies that `.akrctx/local/.gitignore` still keeps the
  implementation log out of Git before it writes or reports one. The log's placement outside
  the review boundary was documented as structural but never checked, so a repository with a
  missing or weakened ignore would have put the implementing agent's own account of its work
  into the diff the judge reads.
- `impl log --record <file>` validates the record before it reaches the store, naming the
  offending field. It was the only input path into the attempt log that bypassed the typed
  contract, so a malformed `validation` array was persisted verbatim.
- Judge snapshots preserve the dependency directory's internal symlink layout instead of
  flattening it. `copyLocalDependencies` used a blanket `dereference`, which turned pnpm's
  symlink farm into real directories and left a `node_modules` in which nothing resolved its
  transitive dependencies, so `akrctx judge verify --run-tests` could not run the test suite
  of any pnpm project — the check that re-executes validation rather than trusting the
  judge's claim was unusable exactly where it mattered. A link that resolves inside the
  dependency tree is now recreated against the snapshot's own copy; one that leaves it is
  still dereferenced, so no snapshot holds a link back into the live project.
- `src/judge-snapshot.ts` imports `symlink`. `overlayChangedFiles` called it on its symlink
  branch, so a snapshot whose changed files included a symlink threw `ReferenceError`.
- `judge enable` refuses when no installed target has a judge agent format, matching
  `comprehension enable` and `impl enable`. With `agents.judge.targets` narrowed to a target
  with no format it previously wrote no file, set `enabled` to true, and reported success.
- An optional `independent` boolean on judge review records (absent means `true`). A reviewer
  who is the same agent or session that implemented, or who runs on a host with no subagent
  isolation (Pi has no agent format), sets `independent: false`. `akrctx judge verify` reports
  a non-independent record as a notice that never changes `valid`, `approved`, or the exit
  code — the mechanical guarantees still hold — and the comprehension gate refuses a
  non-independent approval. This is honesty convention, not cryptographic independence; it
  makes honest self-reviewers flag themselves rather than present a self-review as an
  independent verdict.

### Fixed

- The judge agent instructions now close with a complete, minimal example record whose
  `schemaVersion` is interpolated from the same `JUDGE_SCHEMA_VERSION` constant the schema is
  generated from, rather than a prose list of field names. The previous wording named the
  top-level keys only, so a judge could emit `schemaVersion: 1` and use `notes` where the schema
  requires `evidence`, and `akrctx judge verify` rejected the record. The example shows every
  field `review.schema.json` requires, each `tests` entry carrying exactly `command`, `status`,
  and `evidence`, and states that no other keys are accepted. A test validates the embedded
  example against the real `validateRecord` validator so the example cannot drift from the
  contract it illustrates.

### Security

- `akrctx judge verify --run-tests` no longer inherits the snapshot's `node_modules` into the
  disposable validation workspace. Dependencies are materialised from the committed lockfile
  with a frozen install (`pnpm install --frozen-lockfile`, `npm ci`, or
  `yarn install --frozen-lockfile`), so re-execution rests on the lockfile — a tracked,
  digest-covered file — rather than on bytes inside the reviewed artifact a judge could have
  altered. If the boundary declares dependencies but has no lockfile, or the install fails,
  verification fails with a named reason and never falls back to the snapshot's copy. A
  boundary with no `package.json` (or no dependency fields) needs no install and is unchanged.
- Judge snapshot integrity now fingerprints every tracked and untracked-but-not-ignored path
  by its content *and* its change-time (ctime), and records the same for each covered ancestor
  directory, so a file changed and restored to its original bytes — or a file created and
  deleted inside a tracked directory — is reported as a modification after capture, not only
  a final content mismatch. The inode number is deliberately excluded: it is synthesized by
  FUSE and some network mounts and drifts over time even when nothing changed, which made an
  honest snapshot permanently unreviewable (an independent review round caught this — the
  first fingerprint shipped with the inode number and produced a false "modified after
  capture" on snapshots that had not been touched). The failure message distinguishes
  "workspace content no longer matches" from "workspace was modified after capture". The
  worktree root is excluded so honest ignored build output (`dist/`, `node_modules`) does not
  false-positive. `SNAPSHOT_VERSION` is now 3; snapshots captured before this change fail to
  load with a message saying they predate write detection, and none is silently accepted as
  if it carried the current guarantee. A capture whose self-verifying load fails now removes
  the renamed snapshot directory instead of leaving a permanently unloadable one on disk.

### Known limitations

- Pi has no agent format. It remains a supported target for prompts and skills; configuring
  it under any agent's `targets` warns and is skipped. See `.akrctx/wiki/decisions.md`.

- Immutable, content-addressed Judge review snapshots under
  `.akrctx/local/judge/snapshots/`. `akrctx judge snapshot TASK-XXX --base <ref>` captures
  tracked modifications, deletions, and allowed untracked files without changing the
  live branch, refs, index, stash, history, or worktree.
- `SNAPSHOT:<id>` Judge candidates, stable scope recomputation, tamper detection, concise
  human output, and full JSON metadata for automation. Commit candidates and strict
  `WORKTREE` review remain compatible.
- `akrctx judge current <review.json>` to validate an approved snapshot record and report
  `CURRENT`, `NEWER_CHANGES`, or `DIVERGED` separately from historical approval validity.
- Incremental catch-up snapshots through `judge snapshot --from-review <review.json>`.
  Catch-up exposes only the delta, strongly re-verifies the approved parent, binds its
  record digest, and recursively requires intact snapshot ancestry.
- Dry-run-first `akrctx judge prune --keep <n>` retention. `--force` removes obsolete
  snapshots while preserving any ancestors required by retained catch-up reviews.
- A clarification step before implementation. A question exists only when two plausible answers would produce different implementation, validation, or scope; there is no cap on how many are asked and no "assume and proceed" option. Answers are recorded in the capsule under `## Clarifications` beneath a dated session heading, and any answer that changes a criterion propagates into `acceptance-criteria.md`.
- `## Clarifications` and `## Open Questions` sections in generated task capsules and in the shipped capsule template. One entry is one top-level `- ` bullet; section prose is never content.
- `akrctx judge verify` reports unresolved open questions as a non-blocking notice. The CLI still blocks only on what it can check mechanically, so a notice never changes `valid`, `approved`, or the exit code.
- Opt-in session tracing and contract-conformance reports for Claude Code, Codex, GitHub Copilot, and Pi. Tracing is observational and fail-open; it does not enforce host decisions.
- A deterministic black-box evaluation loop under `evals/`, with disposable fixtures, validated scenario contracts, candidate-only smoke runs, immutable Git-ref comparison, cached builds, and JSON/Markdown reports.
- Initial regression scenarios for task capsule completeness and corrupt-config handling, plus conformance scenarios for trace behavior and hook ownership.

### Changed

- Snapshot capture uses a shallow private Git repository containing only the candidate
  and base commits instead of duplicating complete project history. Local Node
  dependencies are copied with copy-on-write support when available, never symlinked back
  to the live project.
- `judge verify --run-tests` executes snapshot validation in a disposable workspace
  outside the live project. Tracked rewrites still fail boundary verification, ignored
  output is discarded, and neither case mutates the immutable snapshot.
- Generated Judge, workflow, and comprehension instructions teach snapshot capture,
  strong verification, live applicability, catch-up review, trust limits, and retention.
  Comprehension now requires both a valid approval and `judge current` status `CURRENT`;
  a valid historical approval of older code is no longer enough. Comprehension also
  requires `independent: true` on the review record, so a non-independent (self/Pi) approval
  does not satisfy the gate.
- The judge agent instructions and `docs/JUDGE.md` document the `WORKTREE` candidate as a
  fallback when a `SNAPSHOT:<id>` cannot be captured, and state that a same-session or Pi judge
  is non-independent and must set `independent: false` (verification-only, not independent
  judgment; run from another host for an independent verdict).
- Judge, configuration, command, harness, comprehension, README, architecture, and
  decision documentation now describe the snapshot workflow and its limits.
- `## Open Questions` in a task capsule stops being an unused placeholder and gains a defined meaning: ambiguity still unresolved, written as a question. Running headless with nobody to answer, recording it is the correct outcome rather than predicting the answer.
- The `akrctx-task` skill carries the full clarification procedure and is emitted identically to all four targets. Hosts with a native question UI are told to prefer it in their target reference only; the artifact written to the capsule is the same everywhere.
- Evaluation reports separate mechanism conformance from independently supported outcomes; candidate-only runs cannot claim improvement without a baseline. Report artifacts omit raw process output and arguments, fixture paths resolve symlinks before access, and cached builds are published atomically with full `dist/` integrity checks.
- Trace reports now distinguish a known project mutation from unknown first-mutation ordering. Unclassified shell calls before capsule binding produce `capsuleBeforeFirstMutation: null`, while capsule and validation evidence remains in the known-mutating denominator.

### Fixed

- `akrctx judge snapshot` no longer fails when the working tree's file modes differ from a
  fresh `git checkout` (for example `umask 0002` yields 664 on checkout while tracked files sit
  at 644). The snapshot stability manifest is now content-based (file/symlink/dir type +
  content), not permission-bit-based; mode is not a tamper signal for this check. The capture
  error for a deterministic snapshot-vs-live mismatch no longer claims a transient race
  ("retry after file writes settle") — it names the differing paths and states it is not a
  race. Existing local snapshots' IDs change with the digest scheme; recapture them.
- Live edits after capture no longer invalidate a correct approval for immutable reviewed
  content; applicability to newer work is reported independently.
- `judge current` no longer labels malformed, non-approved, stale, or tampered review
  records as current approvals.
- Catch-up no longer accepts a parent's unverified passing claim and no longer remains
  valid after an ancestor snapshot is deleted or tampered with.
- Mutating validation can no longer corrupt the immutable snapshot it is supposed to
  verify, and ignored validation output no longer accumulates inside snapshot evidence.
- Fresh task capsule templates include `acceptance-criteria.md`.
- Task creation fails loudly on invalid `.akrctx/config.json` instead of silently falling back to permissive defaults.
- Full removal unwires akrctx-owned trace hooks for every host before deleting project configuration, while preserving foreign entries.
- Claude failed-tool events settle their matching attempts, validation requires a successful correlated outcome, and trace status rejects partial or mismatched wiring.

### Security

- Remove tracked paths matching `blockedReadPatterns` from the reviewable snapshot
  worktree after checkout, including blocked files deleted live but still present in the
  candidate commit. Snapshot documentation makes explicit that Git object storage is not
  encryption or secret-history rewriting.
- Replace the live `node_modules` symlink with a private dependency copy, closing the
  `node_modules/..` path back into the live project during ordinary validation. Existing
  local snapshots that still contain a linked dependency directory are rejected and must
  be recaptured.
- Snapshot validation isolation is documented accurately as protection from normal
  relative writes, not as an operating-system sandbox for malicious commands using
  absolute paths.

### Fixed

- `akrctx doctor` no longer dirties the working tree on an unchanged audit. The wiki
  reports (`agent-setup.md`, `gaps.md`, `recommendations.md`) are rewritten only when
  their content beyond the frontmatter `timestamp:` changes; a repeated run now leaves
  the files byte-identical instead of advancing the timestamp and producing empty diffs.
- The source repository now passes its own doctor audit on a fresh clone. `.codex/agents/`
  is no longer gitignored, so the agent files required by the dogfooded configuration
  (`judge.enabled: true`) are part of the checkout; a test asserts every config-required
  agent file is tracked, and an enabled agent whose files are ignored now fails CI instead
  of surprising the next contributor.

### Internal

- `src/cli.ts` was split from a single ~1700-line module into per-command-family modules
  under `src/cli/`, each exporting a `register*(program)` function. The observable CLI
  surface is unchanged and frozen by `--help` snapshot tests.

## [0.4.0] - 2026-08-01

### Added

- `akrctx judge verify --run-tests` independently re-executes capsule-declared validation commands claimed as passing and rejects approvals when validation changes the reviewed boundary.
- Human-readable output for `akrctx judge scope`; `--json` retains the structured scope used in review records.

### Changed

- Upgraded the Judge review contract to schema v2 with CLI-version provenance and policy-withheld paths.
- New task capsules include a `## Validation` declaration; present but empty or malformed declarations prevent approval, while legacy capsules without the section retain compatibility.
- Primary agents always save Judge records and run strong verification before acting on a verdict; read-only Judge and comprehension agents never execute `--run-tests`.
- Judge documentation now describes the actual trust boundary: re-execution moves trust from the review record to the agent-authored task capsule rather than eliminating it.

### Fixed

- Reject `APPROVED` records without passing validation or with unresolved issues.
- Reject passing evidence based only on commands not declared by the task capsule.
- Recompute the Judge boundary after validation so formatters, snapshot updates, and code generation cannot silently invalidate an approval.
- Make the `judge scope --json` flag meaningful and route Judge CLI options through the common normalization path.

### Security

- Exclude tracked and untracked paths matching `blockedReadPatterns` from the Judge diff before their contents are fingerprinted.
- Record withheld paths without their contents and include the path set in the boundary digest.
- Fail closed when `policy.json` or `blockedReadPatterns` cannot be used instead of silently falling back to weaker defaults.

## [0.3.0] - 2026-07-14

### Added

- Optional developer comprehension checkpoints for significant completed changes.
- Platform-native `akrctx-comprehension` agents for Codex, Claude Code, and GitHub Copilot, plus versioned scope, rubric, and result schemas.
- `akrctx comprehension enable|disable|status` commands.
- Git-ignored local storage for personal responses and assisted-learning records.
- Visual change maps, test matrices, one-question-at-a-time teaching, and structured learning reports.
- Post-initialization `akrctx templates apply` and `templates status` commands, including sequential multi-pack composition and local pack support.

### Changed

- Comprehension runs in a separate agent context instead of loading a skill into the implementing agent.
- The primary workflow now offers judge review first and hands only the exact code boundary and verdict to comprehension.
- Judge agents independently derive the review boundary, use read-only controls where supported, and emit structured review evidence.
- Deterministic `judge scope` and `judge verify` commands bind approvals to SHA-256 digests of the task capsule and exact code boundary, invalidating stale verdicts before comprehension.
- Safe upgrades now preserve wiki pages, task capsules, local records, and root instructions; generated files update only when their recorded manifest hash proves they are unchanged.
- Added `.akrctx/manifest.json`, versioned upgrade candidates, conservative legacy handling, field-level config/policy migration, and non-destructive obsolete-file reporting.
- Doctor agents may apply surgical protected-instruction merges only after showing the exact diff and receiving explicit human approval in the current conversation; `doctor --fix` no longer creates spurious merge suggestions during repair.
- Template application is independent from `init`, transactional for blocking conflicts, non-destructive for project content, and records pack versions, targets, and target-file hashes for upgrade provenance.

### Security

- Comprehension evaluators may inspect only in-scope, non-blocked Git data with read-only commands.
- Enabling fails when the local ignore contract is unsafe; `doctor --fix` repairs it.
- Personal records are preserved by `remove --all` unless `--purge-local` is explicit.

## [0.2.0] - 2026-07-04

Audit hardening release. Fixes critical and medium-severity bugs found in a
security/quality/DX audit, tightens security-relevant defaults, and cleans up
a few DX rough edges. See `docs/AUDIT-PLAN.md` for the full rationale behind
each change.

### Fixed — critical

- `akrctx doctor --fix` actually repairs the harness now: the CLI layer was
  dropping the `--fix` flag before it reached `runDoctor`, so `--fix` was a
  silent no-op from the command line.
- `selectWorkflow` no longer filters out the "UI review" task recommendation
  against `allowedWorkflows` — it's a task-level recommendation, not a
  selectable workflow default, so it always passes through.
- `akrctx compile` always regenerates the export brief. Previously a stale
  export was silently preserved without `--force` while the CLI still printed
  "Compiled: ...".
- `akrctx config show` and `config set` now distinguish a corrupt
  `.akrctx/config.json` (throws a clear error) from a missing one (suggests
  `akrctx init`) — previously both cases reported "not found", and following
  that advice on a corrupt config would have silently overwritten it.
- `akrctx doctor --ci` no longer fails when the installed harness version
  drifts from the current CLI version. Doctor suggestions are now structured
  `{ text, severity }` objects (`"error" | "warning" | "info"`), and `--ci`
  only fails on `severity: "error"`. **Breaking for JSON consumers:**
  `DoctorResult.suggestions` changed from `string[]` to `Suggestion[]`.

### Fixed — medium

- `doctor --fix` repairs every installed target, not just the first.
- `doctor --fix` only reports `.akrctx/config.json` / `.akrctx/policy.json`
  as "fixed" when the merge actually changed something.
- Wiki lint handles CRLF frontmatter and links with an anchor fragment
  (`file.md#anchor`) or a markdown title (`file.md "Title"`).
- `akrctx init` fails with a clear error instead of silently defaulting to
  `codex` when run non-interactively with no `--target` and no (or multiple)
  detected setups. **Breaking:** scripts relying on the old silent-fallback
  behavior must now pass an explicit `--target`.
- Task capsules (`listTasks`, `runStatus`) sort numerically by `TASK-XXX`
  instead of lexicographically (`TASK-010` no longer sorts before `TASK-002`).
- `judge enable --dry-run` prints "would enable (dry-run)" instead of
  claiming the judge was enabled; `runJudgeStatus` no longer scans the
  filesystem twice.
- `akrctx remove` dry-run preview now matches what `--force` actually does,
  including directories that would be pruned once empty. Clarified
  `--target all` (files for every target) vs `--all` (also removes
  `.akrctx/`) in the command's help text.

### Security

- Documented in `README.md` that `policy.json`, `blockedReadPatterns`, and
  `protectedFiles` are prompt-level/convention controls, not technical
  enforcement — they do not resist prompt injection or a malicious agent.
- `akrctx init` now warns (`InitResult.policyWarnings`) when a template pack
  weakens enforcement (changes `mergeStrategy` or flips an `enforcement.*`
  flag from `true` to `false`). It does not block the pack — some enterprise
  packs relax enforcement on purpose — it just makes the change visible.
- `akrctx remove --all` no longer deletes task capsules under
  `.akrctx/tasks/`. **Breaking:** if you relied on `--all` fully wiping
  `.akrctx/`, pass the new `--purge-tasks` flag alongside it.

### Changed — DX

- `akrctx upgrade` flags akrctx-owned files whose content differs from the
  current template with `reason: "overwritten (had local modifications)"`
  and lists them in a "review with git diff" warning. There is no stored
  hash of the previous template version, so this can't distinguish a
  genuine local edit from an old template version — commit before upgrading.
- Removed the leftover "tetris" keyword from workflow recommendation and
  reordered precedence so bug/test signals (TDD) are checked before domain
  keywords (SDD) — "fix the api bug" now recommends TDD instead of SDD.
- `akrctx init` writes `.akrctx/targets/<t>.md` only for the selected
  target(s) instead of all four; `akrctx doctor` requires it only for
  installed targets.
- Deduplicated the `task create <description>` / `task <description>`
  handlers in the CLI (no behavior change).
- `judge enable` no longer accepts a `--target` flag it never used.
- `akrctx doctor`'s readiness score is now weighted by issue category
  instead of a flat per-item penalty: missing harness file (-5, cap 40),
  config/policy gap (-3, cap 20), wiki-lint issue (-1, cap 10), conflict
  (-10, cap 40), no target installed (-25). Wiki-lint issues no longer
  appear in `DoctorResult.missing` (they're `warning`-severity suggestions
  instead), so they no longer fail `doctor --ci`.

### Added

- `akrctx config set allowedWorkflows` to restrict which workflows the CLI and agent may use.
- Task workflow selection now validates against `defaults.allowedWorkflows`:
  - Explicit `--workflow` values outside the allowed list are rejected.
  - A configured `defaultWorkflow` outside the allowed list is rejected as a misconfiguration.
  - When `task-fit` recommends a disallowed workflow, the CLI falls back to the first allowed workflow and records the reason in the task capsule.
- Task management subcommands: `akrctx task list`, `akrctx task show TASK-001`, `akrctx task rm TASK-001`.
- `akrctx doctor --fix` to automatically recreate missing harness files and repair config/policy gaps.
- `akrctx compile --target all` to compile a brief for every installed target at once.
- Documentation for `allowedWorkflows` and the new commands in `docs/CONFIGURATION.md`, `docs/COMMANDS_AND_UX.md`, and `README.md`.
- `CHANGELOG.md` and versioning/release process in `docs/RELEASE_CHECKLIST.md`.
- OKF-style YAML frontmatter on every `.akrctx/wiki/` page (`type`, `title`, `description`, `tags`, `timestamp`).
- `akrctx doctor` now writes `.akrctx/wiki/gaps.md` and `.akrctx/wiki/recommendations.md` alongside `.akrctx/wiki/agent-setup.md`.
- New `.akrctx/wiki/index.md` catalog with bundle-relative links to all wiki pages.
- `.akrctx/wiki/log.md` now uses ISO-date headings.
- Wiki lint integrated into `akrctx doctor`: reports broken links, orphan pages, and missing or invalid frontmatter timestamps.
- Doctor and write-policy skills now instruct agents to keep the wiki alive by recording architecture, conventions, testing commands, and decisions as they are discovered.
- `.akrctx/wiki/write-policy.md` recommends bundle-relative links (`/wiki/decisions.md`) for cross-page references.
- `DoctorResult` exposes a new `wikiLint` field, included in `akrctx doctor --json` output.
