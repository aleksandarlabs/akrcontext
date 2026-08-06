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
