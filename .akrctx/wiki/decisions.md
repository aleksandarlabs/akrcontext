---
type: akrctx-wiki-decisions
title: "Decisions"
description: "Important project and agent-workflow decisions."
tags: ["decisions"]
timestamp: 2026-08-05T21:08:00.000Z
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
